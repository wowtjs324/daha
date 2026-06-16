const fs = require('fs');
const path = require('path');

const vaultPath = './vault';

const files = fs.readdirSync(vaultPath);

const result = [];

files.forEach(file => {

  const fullPath =
    path.join(vaultPath, file);

  const text =
    fs.readFileSync(fullPath, 'utf-8');

  // [[링크]] 찾기
  const links =
    [...text.matchAll(/\[\[(.*?)\]\]/g)]
    .map(m => m[1].toLowerCase());

  // 중요도 계산
  const importance =
    links.length * 2
    + text.length * 0.001;

  result.push({

    title:
      file.replace('.md','').toLowerCase(),

    importance,

    links,

  });

});

fs.writeFileSync(
  './data.json',
  JSON.stringify(result, null, 2)
);

console.log('data.json 생성 완료');