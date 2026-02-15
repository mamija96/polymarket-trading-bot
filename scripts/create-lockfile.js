import { writeFileSync, readdirSync } from "fs";
import { join } from "path";

console.log("CWD:", process.cwd());
console.log("Files in CWD:", readdirSync(process.cwd()));
