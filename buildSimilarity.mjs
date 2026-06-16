import fs from 'fs';

// ===== 데이터 읽기 =====
const notes = JSON.parse(

  fs.readFileSync(
    './data-embedded.json',
    'utf-8'
  )

);

// ===== cosine similarity =====
function cosineSimilarity(a, b) {

  const dot =
    a.reduce(
      (sum, val, i) =>
        sum + val * b[i],
      0
    );

  const magA =
    Math.sqrt(
      a.reduce(
        (sum, val) =>
          sum + val * val,
        0
      )
    );

  const magB =
    Math.sqrt(
      b.reduce(
        (sum, val) =>
          sum + val * val,
        0
      )
    );

  return dot / (magA * magB);

}

// ===== 자동 연결 생성 =====
notes.forEach(note => {

  note.links = [];

  notes.forEach(other => {

    if (note.title === other.title)
      return;

    const similarity =
      cosineSimilarity(
        note.embedding,
        other.embedding
      );

    // 유사도 기준
    if (similarity > 0.78) {

      note.links.push({

        target: other.title,

        similarity:
          Number(
            similarity.toFixed(2)
          )

      });

    }

  });

  // similarity 높은 순 정렬
  note.links.sort(
    (a, b) =>
      b.similarity - a.similarity
  );

  // 최대 연결 개수 제한
  note.links =
    note.links.slice(0, 6);

});

// ===== 저장 =====
fs.writeFileSync(

  './final-data.json',

  JSON.stringify(
    notes,
    null,
    2
  )

);

console.log(
  '자동 관계 생성 완료'
);