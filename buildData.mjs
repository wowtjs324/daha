import fs from 'fs';
import path from 'path';

const vaultPath = './vault';

const files =
  fs.readdirSync(vaultPath);

const data = [];

files.forEach(file => {

  if (!file.endsWith('.md')) return;

  const content =
    fs.readFileSync(
      path.join(vaultPath, file),
      'utf-8'
    );

  // ===== title =====
  const titleMatch =
    content.match(
      /title:\s*(.+)/i
    );

  // ===== importance =====
  const importanceMatch =
    content.match(
      /importance:\s*(\d+)/i
    );

  // ===== tags =====
  const tagsMatch =
    [...content.matchAll(
      /-\s*(.+)/g
    )];

  // ===== links section =====
  const linksSection =
    content.split('## links')[1] || '';

  const links =
    [...linksSection.matchAll(
      /-\s*(.+)/g
    )].map(m => m[1].trim());

  // ===== body =====
  const bodyMatch =
    content.match(
      /---[\s\S]*?---([\s\S]*?)## links/i
    );

  const body =
    bodyMatch
    ? bodyMatch[1].trim()
    : '';

  const title =
    titleMatch
    ? titleMatch[1].trim()
    : file.replace('.md', '');

  const importance =
    importanceMatch
    ? parseInt(
        importanceMatch[1]
      )
    : 1;

  data.push({

    title,
    importance,
    content: body,
    links

  });

});

fs.writeFileSync(

  './data.json',

  JSON.stringify(
    data,
    null,
    2
  )

);

console.log(
  '새로운 data.json 생성 완료'
);