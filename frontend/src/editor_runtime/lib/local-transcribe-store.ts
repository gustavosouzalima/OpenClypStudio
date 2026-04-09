import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";

const transcriptsRoot = path.join(process.cwd(), "public", "transcriptions");
if (!fs.existsSync(transcriptsRoot)) {
  fs.mkdirSync(transcriptsRoot, { recursive: true });
}

export function createLocalTranscript(mediaUrl: string) {
  const safeWords = path
    .basename(mediaUrl)
    .replace(/[^\w]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  const wordsPool =
    safeWords.length > 0
      ? safeWords
      : ["sample", "transcript", "generated", "locally"];

  const words = wordsPool.map((word, index) => ({
    word,
    start: index * 0.5,
    end: index * 0.5 + 0.45,
    confidence: 0.9
  }));

  const transcriptData = {
    results: {
      main: {
        words
      }
    }
  };

  const fileName = `${randomUUID()}.json`;
  const filePath = path.join(transcriptsRoot, fileName);
  fs.writeFileSync(filePath, JSON.stringify(transcriptData));

  return `/transcriptions/${fileName}`;
}
