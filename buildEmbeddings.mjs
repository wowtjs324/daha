import fs from 'fs';

import {
  pipeline
} from '@xenova/transformers';

const extractor =
  await pipeline(
    'feature-extraction',
    'Xenova/all-MiniLM-L6-v2'
  );

const notes = JSON.parse(

  fs.readFileSync(
    './data.json',
    'utf-8'
  )

);

for (const note of notes) {

  console.log(
    `Embedding: ${note.title}`
  );

  const output =
    await extractor(
      note.content,
      {
        pooling: 'mean',
        normalize: true
      }
    );

  note.embedding =
    Array.from(output.data);

}

fs.writeFileSync(

  './data-embedded.json',

  JSON.stringify(
    notes,
    null,
    2
  )

);

console.log(
  '완료'
);