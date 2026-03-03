// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Strings.sol";
import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";

contract BlokyzNFT is ERC721, Ownable, ReentrancyGuard {
    using Strings for uint256;
    using EnumerableSet for EnumerableSet.AddressSet;

    // ── Admin ──────────────────────────────────────────────────────────────
    EnumerableSet.AddressSet private _admins;

    modifier adminRequired() {
        require(
            owner() == msg.sender || _admins.contains(msg.sender),
            "Must be owner or admin"
        );
        _;
    }

    function approveAdmin(address admin) external onlyOwner {
        require(admin != address(0), "Zero address");
        _admins.add(admin);
    }

    function revokeAdmin(address admin) external onlyOwner {
        _admins.remove(admin);
    }

    function isAdmin(address admin) public view returns (bool) {
        return owner() == admin || _admins.contains(admin);
    }

    function getAdmins() external view returns (address[] memory) {
        address[] memory admins = new address[](_admins.length());
        for (uint256 i = 0; i < _admins.length(); i++) {
            admins[i] = _admins.at(i);
        }
        return admins;
    }

    // ── Supply ─────────────────────────────────────────────────────────────
    uint256 public constant MAX_SUPPLY = 10_000;
    uint256 public totalSupply;

    // ── Minter ─────────────────────────────────────────────────────────────
    mapping(address => bool) public minterAddresses;

    modifier onlyMinter() {
        require(
            msg.sender == owner() || minterAddresses[msg.sender],
            "Not minter"
        );
        _;
    }

    function setMinterAddresses(
        address[] calldata addresses,
        bool[] calldata allowed
    ) external onlyOwner {
        require(addresses.length == allowed.length, "Length mismatch");
        for (uint256 i = 0; i < addresses.length; i++) {
            require(addresses[i] != address(0), "Zero address");
            minterAddresses[addresses[i]] = allowed[i];
            emit MinterAddressSet(addresses[i], allowed[i]);
        }
    }

    // ── Metadata ───────────────────────────────────────────────────────────
    string private _placeholderURI;
    string private _baseTokenURI;
    bool public revealed;

    // ── Royalties ──────────────────────────────────────────────────────────
    address payable private _royaltyRecipient;
    uint256 private _royaltyBps;

    bytes4 private constant _INTERFACE_ID_ROYALTIES_CREATORCORE = 0xbb3bafd6;
    bytes4 private constant _INTERFACE_ID_ROYALTIES_EIP2981     = 0x2a55205a;
    bytes4 private constant _INTERFACE_ID_ROYALTIES_RARIBLE     = 0xb7799584;

    // ── Events ─────────────────────────────────────────────────────────────
    event MinterAddressSet(address indexed minter, bool allowed);
    event Revealed(string baseURI);
    event RoyaltyUpdated(address indexed recipient, uint256 bps);
    event BatchMetadataUpdate(uint256 fromTokenId, uint256 toTokenId);

    // ── Errors ─────────────────────────────────────────────────────────────
    error ExceedsMaxSupply();
    error AlreadyRevealed();
    error ZeroAddress();
    error RoyaltyTooHigh();
    error WithdrawFailed();

    // ── Constructor ────────────────────────────────────────────────────────
    constructor(
        string memory placeholderURI,
        address payable royaltyRecipient,
        uint256 royaltyBps
    ) ERC721("Blokyz", "BLKY") {
        if (royaltyRecipient == address(0)) revert ZeroAddress();
        if (royaltyBps > 1000) revert RoyaltyTooHigh();

        _placeholderURI   = placeholderURI;
        _royaltyRecipient = royaltyRecipient;
        _royaltyBps       = royaltyBps;
    }

    // ── Mint ───────────────────────────────────────────────────────────────
    function mint(address to, uint256 qty) external onlyMinter nonReentrant {
        if (totalSupply + qty > MAX_SUPPLY) revert ExceedsMaxSupply();
        for (uint256 i = 0; i < qty;) {
            unchecked { ++totalSupply; }
            _mint(to, totalSupply);
            unchecked { ++i; }
        }
    }

    function airdrop(
        address[] calldata recipients,
        uint256 qtyEach
    ) external adminRequired nonReentrant {
        if (totalSupply + (recipients.length * qtyEach) > MAX_SUPPLY)
            revert ExceedsMaxSupply();

        for (uint256 i = 0; i < recipients.length;) {
            for (uint256 j = 0; j < qtyEach;) {
                unchecked { ++totalSupply; }
                _mint(recipients[i], totalSupply);
                unchecked { ++j; }
            }
            unchecked { ++i; }
        }
    }

    // ── Metadata ───────────────────────────────────────────────────────────
    function tokenURI(uint256 tokenId)
        public
        view
        override
        returns (string memory)
    {
        require(_ownerOf(tokenId) != address(0), "Token does not exist");
        if (!revealed) return _placeholderURI;
        return string(
            abi.encodePacked(_baseTokenURI, tokenId.toString(), ".json")
        );
    }

    function reveal(string calldata baseURI) external adminRequired {
        if (revealed) revert AlreadyRevealed();
        _baseTokenURI = baseURI;
        revealed = true;
        emit Revealed(baseURI);
        emit BatchMetadataUpdate(1, totalSupply);
    }

    function setPlaceholderURI(string calldata placeholderURI)
        external
        adminRequired
    {
        if (revealed) revert AlreadyRevealed();
        _placeholderURI = placeholderURI;
        emit BatchMetadataUpdate(1, totalSupply);
    }

    // ── Admin ──────────────────────────────────────────────────────────────
    function withdraw(
        address payable recipient,
        uint256 amount
    ) external adminRequired {
        if (recipient == address(0)) revert ZeroAddress();
        (bool success,) = recipient.call{value: amount}("");
        if (!success) revert WithdrawFailed();
    }

    // ── Royalties ──────────────────────────────────────────────────────────
    function updateRoyalties(
        address payable recipient,
        uint256 bps
    ) external adminRequired {
        if (recipient == address(0)) revert ZeroAddress();
        if (bps > 1000) revert RoyaltyTooHigh();
        _royaltyRecipient = recipient;
        _royaltyBps       = bps;
        emit RoyaltyUpdated(recipient, bps);
    }

    function royaltyInfo(
        uint256,
        uint256 salePrice
    ) external view returns (address, uint256) {
        return (_royaltyRecipient, (salePrice * _royaltyBps) / 10_000);
    }

    function getRoyalties(uint256)
        external
        view
        returns (address payable[] memory recipients, uint256[] memory bps)
    {
        if (_royaltyRecipient != address(0)) {
            recipients    = new address payable[](1);
            recipients[0] = _royaltyRecipient;
            bps           = new uint256[](1);
            bps[0]        = _royaltyBps;
        }
    }

    function getFeeRecipients(uint256)
        external
        view
        returns (address payable[] memory recipients)
    {
        if (_royaltyRecipient != address(0)) {
            recipients    = new address payable[](1);
            recipients[0] = _royaltyRecipient;
        }
    }

    function getFeeBps(uint256)
        external
        view
        returns (uint256[] memory bps)
    {
        if (_royaltyRecipient != address(0)) {
            bps    = new uint256[](1);
            bps[0] = _royaltyBps;
        }
    }

    // ── ERC165 ─────────────────────────────────────────────────────────────
    function supportsInterface(bytes4 interfaceId)
        public
        view
        override
        returns (bool)
    {
        return
            interfaceId == _INTERFACE_ID_ROYALTIES_CREATORCORE ||
            interfaceId == _INTERFACE_ID_ROYALTIES_EIP2981     ||
            interfaceId == _INTERFACE_ID_ROYALTIES_RARIBLE     ||
            super.supportsInterface(interfaceId);
    }

    // ── Receive ETH ────────────────────────────────────────────────────────
    receive() external payable {}
}