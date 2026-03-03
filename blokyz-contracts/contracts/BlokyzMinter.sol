// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/Strings.sol";

interface IBlokyzNFT {
    function mint(address to, uint256 qty) external;
}

contract BlokyzMinter is Ownable, ReentrancyGuard {
    using ECDSA for bytes32;
    using Strings for uint256;
    using Strings for address;

    // ── NFT Contract ───────────────────────────────────────────────────────
    IBlokyzNFT public blokyzNFT;

    // ── Phases ─────────────────────────────────────────────────────────────
    enum Phase {
        NONE,
        GTD_FREE,
        GTD_MINT,
        WL_FCFS,
        PUBLIC
    }

    struct PhaseConfig {
        uint256 startTime;
        uint256 endTime;
        uint256 price;
        uint256 walletCap;
        bool    active;
    }

    mapping(Phase => PhaseConfig) public phases;

    // ── Per Phase Per Wallet Tracking ──────────────────────────────────────
    mapping(Phase => mapping(address => uint256)) public mintedPerPhase;

    // ── Signer ─────────────────────────────────────────────────────────────
    address public signerAddress;

    // ── Nonce Tracking ─────────────────────────────────────────────────────
    mapping(bytes32 => bool) private _usedNonces;

    // ── Pause ──────────────────────────────────────────────────────────────
    bool public paused;

    // ── Events ─────────────────────────────────────────────────────────────
    event Minted(address indexed to, Phase indexed phase, uint256 qty);
    event PhaseConfigured(Phase indexed phase, uint256 startTime, uint256 endTime, uint256 price, uint256 walletCap);
    event SignerUpdated(address indexed signer);
    event Withdrawn(address indexed recipient, uint256 amount);
    event PausedStateChanged(bool paused);
    event NFTContractUpdated(address indexed nftContract);

    // ── Errors ─────────────────────────────────────────────────────────────
    error ContractPaused();
    error PhaseNotActive();
    error WrongPayment();
    error WalletCapExceeded();
    error InvalidSignature();
    error NonceAlreadyUsed();
    error ZeroAddress();
    error WithdrawFailed();
    error InvalidQty();
    error SignatureExpired();

    // ── Constructor ────────────────────────────────────────────────────────
    constructor(
        address nftContract,
        address signer
    ) {
        if (nftContract == address(0)) revert ZeroAddress();
        if (signer == address(0)) revert ZeroAddress();

        blokyzNFT     = IBlokyzNFT(nftContract);
        signerAddress = signer;
    }

    // ── Phase Configuration ────────────────────────────────────────────────
    function configurePhase(
        Phase phase,
        uint256 startTime,
        uint256 endTime,
        uint256 price,
        uint256 walletCap,
        bool    active
    ) external onlyOwner {
        require(phase != Phase.NONE, "Invalid phase");
        require(endTime > startTime, "Invalid time range");

        phases[phase] = PhaseConfig({
            startTime: startTime,
            endTime:   endTime,
            price:     price,
            walletCap: walletCap,
            active:    active
        });

        emit PhaseConfigured(phase, startTime, endTime, price, walletCap);
    }

    function setPhaseActive(Phase phase, bool active) external onlyOwner {
        require(phase != Phase.NONE, "Invalid phase");
        phases[phase].active = active;
    }

    // ── Current Phase View ─────────────────────────────────────────────────
    function currentPhase() public view returns (Phase) {
        Phase[4] memory order = [
            Phase.GTD_FREE,
            Phase.GTD_MINT,
            Phase.WL_FCFS,
            Phase.PUBLIC
        ];

        for (uint256 i = 0; i < order.length;) {
            PhaseConfig memory cfg = phases[order[i]];
            if (
                cfg.active &&
                block.timestamp >= cfg.startTime &&
                block.timestamp <= cfg.endTime
            ) {
                return order[i];
            }
            unchecked { ++i; }
        }

        return Phase.NONE;
    }

    // ── Internal Validation ────────────────────────────────────────────────
    function _validatePhase(Phase phase) internal view {
        PhaseConfig memory cfg = phases[phase];
        if (
            !cfg.active ||
            block.timestamp < cfg.startTime ||
            block.timestamp > cfg.endTime
        ) revert PhaseNotActive();
    }

    function _validatePayment(Phase phase, uint256 qty) internal view {
        uint256 expected = phases[phase].price * qty;
        if (msg.value != expected) revert WrongPayment();
    }

    function _validateAllocation(
        Phase   phase,
        address wallet,
        uint256 qty
    ) internal view {
        uint256 cap     = phases[phase].walletCap;
        uint256 minted  = mintedPerPhase[phase][wallet];
        if (minted + qty > cap) revert WalletCapExceeded();
    }

    function _validateSignature(
        address wallet,
        Phase   phase,
        uint256 maxAlloc,
        uint256 expiry,
        string  calldata nonce,
        bytes   calldata signature
    ) internal {
        // Check expiry
        if (block.timestamp > expiry) revert SignatureExpired();

        // Check nonce not used
        bytes32 nonceHash = keccak256(abi.encodePacked(nonce));
        if (_usedNonces[nonceHash]) revert NonceAlreadyUsed();

        // Reconstruct the message the backend signed
        bytes32 messageHash = keccak256(
            abi.encodePacked(
                wallet,
                uint256(phase),
                maxAlloc,
                expiry,
                nonce
            )
        );

        // Wrap with Ethereum signed message prefix
        bytes32 ethSignedHash = messageHash.toEthSignedMessageHash();

        // Recover signer and verify
        address recovered = ethSignedHash.recover(signature);
        if (recovered != signerAddress) revert InvalidSignature();

        // Mark nonce as used
        _usedNonces[nonceHash] = true;
    }

    // ── Mint Functions ─────────────────────────────────────────────────────

    // GTD Free, GTD Mint, WL FCFS — all require signature
    function mint(
        uint256        qty,
        Phase          phase,
        uint256        maxAlloc,
        uint256        expiry,
        string calldata nonce,
        bytes  calldata signature
    ) external payable nonReentrant {
        if (paused) revert ContractPaused();
        if (qty == 0) revert InvalidQty();
        require(
            phase == Phase.GTD_FREE ||
            phase == Phase.GTD_MINT ||
            phase == Phase.WL_FCFS,
            "Use publicMint for public phase"
        );

        // 1. Validate phase is active and within time window
        _validatePhase(phase);

        // 2. Validate signature from backend
        _validateSignature(msg.sender, phase, maxAlloc, expiry, nonce, signature);

        // 3. Validate payment
        _validatePayment(phase, qty);

        // 4. Validate wallet allocation
        // Use maxAlloc from signature if lower than phase walletCap
        uint256 cap    = phases[phase].walletCap;
        uint256 minted = mintedPerPhase[phase][msg.sender];
        uint256 limit  = maxAlloc < cap ? maxAlloc : cap;
        if (minted + qty > limit) revert WalletCapExceeded();

        // 5. Record mint
        mintedPerPhase[phase][msg.sender] += qty;

        // 6. Call NFT contract
        blokyzNFT.mint(msg.sender, qty);

        emit Minted(msg.sender, phase, qty);
    }

    // Public phase — no signature needed
    function publicMint(uint256 qty) external payable nonReentrant {
        if (paused) revert ContractPaused();
        if (qty == 0) revert InvalidQty();

        // 1. Validate phase
        _validatePhase(Phase.PUBLIC);

        // 2. Validate payment
        _validatePayment(Phase.PUBLIC, qty);

        // 3. Validate wallet cap
        _validateAllocation(Phase.PUBLIC, msg.sender, qty);

        // 4. Record mint
        mintedPerPhase[Phase.PUBLIC][msg.sender] += qty;

        // 5. Call NFT contract
        blokyzNFT.mint(msg.sender, qty);

        emit Minted(msg.sender, Phase.PUBLIC, qty);
    }

    // ── Admin ──────────────────────────────────────────────────────────────
    function setSigner(address signer) external onlyOwner {
        if (signer == address(0)) revert ZeroAddress();
        signerAddress = signer;
        emit SignerUpdated(signer);
    }

    function setNFTContract(address nftContract) external onlyOwner {
        if (nftContract == address(0)) revert ZeroAddress();
        blokyzNFT = IBlokyzNFT(nftContract);
        emit NFTContractUpdated(nftContract);
    }

    function setPaused(bool _paused) external onlyOwner {
        paused = _paused;
        emit PausedStateChanged(_paused);
    }

    function withdraw(address payable recipient, uint256 amount) external onlyOwner {
        if (recipient == address(0)) revert ZeroAddress();
        (bool success,) = recipient.call{value: amount}("");
        if (!success) revert WithdrawFailed();
        emit Withdrawn(recipient, amount);
    }

    // ── View Helpers ───────────────────────────────────────────────────────
    function getMintedByPhase(Phase phase, address wallet) external view returns (uint256) {
        return mintedPerPhase[phase][wallet];
    }

    function getPhaseConfig(Phase phase) external view returns (PhaseConfig memory) {
        return phases[phase];
    }

    function isNonceUsed(string calldata nonce) external view returns (bool) {
        return _usedNonces[keccak256(abi.encodePacked(nonce))];
    }

    // ── Receive ETH ────────────────────────────────────────────────────────
    receive() external payable {}
}
