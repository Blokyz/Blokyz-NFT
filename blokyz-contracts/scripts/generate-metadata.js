import fs   from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

const TOTAL   = 1_000;
const CID     = "bafkreicdbw4rdntfsvhhfde2dznwas7t4taxzutudejrarnyoweh6omzaa";
const OUT_DIR = path.join(__dirname, "metadata");

if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

console.log(`\n🧱 Generating ${TOTAL.toLocaleString()} metadata files...`);

for (let i = 1; i <= TOTAL; i++) {
    fs.writeFileSync(
        path.join(OUT_DIR, `${i}.json`),
        JSON.stringify({
            name:         `Blokyz #${i}`,
            description:  "Blokyz is a phygital NFT collection — unique toy characters bridging the physical and digital worlds.",
            image:        `ipfs://${CID}`,
            external_url: "https://blokyz.xyz",
            attributes: [
                { trait_type: "Status",   value: "Test" },
                { trait_type: "Token ID", value: i      },
            ],
        }, null, 2),
        "utf8"
    );
}

console.log(`✅  Done — ${TOTAL} files written to scripts/metadata/`);
console.log(`\n   Upload the metadata/ folder to Pinata, then call:`);
console.log(`   reveal("ipfs://<FOLDER_CID>/")\n`);
