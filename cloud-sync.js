/**
 * Knowledge Vault — Supabase 클라우드 동기화
 * Supabase를 동적 import로 로드해서 CDN 실패 시에도 앱이 정상 작동합니다.
 */

// ─── 여기 두 값을 Supabase 프로젝트에서 복사해서 넣으세요 ───
const SUPABASE_URL      = 'YOUR_SUPABASE_URL';
const SUPABASE_ANON_KEY = 'YOUR_SUPABASE_ANON_KEY';
// ────────────────────────────────────────────────────────────

export const isConfigured = SUPABASE_URL !== 'YOUR_SUPABASE_URL';

let _supabase = null;

async function getClient() {
  if (_supabase) return _supabase;
  if (!isConfigured) return null;
  try {
    const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2');
    _supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    return _supabase;
  } catch (e) {
    console.warn('[vault:cloud] Supabase 로드 실패:', e.message);
    return null;
  }
}

/**
 * 앱 시작 시 클라우드에서 메모를 내려받아 localStorage에 채웁니다.
 */
export async function syncFromCloud(userName) {
  if (!isConfigured || !userName) return;
  const supabase = await getClient();
  if (!supabase) return;
  try {
    const { data, error } = await supabase
      .from('vault_memos')
      .select('note_title, memo, updated_at')
      .eq('user_name', userName);
    if (error) throw error;

    data.forEach(row => {
      const localKey  = `_vaultMemo_${row.note_title}`;
      const timeKey   = `_vaultMemoTime_${row.note_title}`;
      const cloudTime = row.updated_at ? new Date(row.updated_at).getTime() : 0;
      const localTime = localStorage.getItem(`_vaultMemoTS_${row.note_title}`) || 0;

      if (cloudTime > Number(localTime)) {
        localStorage.setItem(localKey, row.memo || '');
        localStorage.setItem(`_vaultMemoTS_${row.note_title}`, String(cloudTime));
        if (row.updated_at) {
          const d = new Date(row.updated_at);
          localStorage.setItem(timeKey, d.toLocaleString('ko-KR', {
            month: 'numeric', day: 'numeric',
            hour: '2-digit', minute: '2-digit',
          }));
        }
      }
    });
    console.log(`[vault:cloud] ${data.length}개 메모 동기화 완료`);
  } catch (e) {
    console.warn('[vault:cloud] 동기화 실패 (오프라인 모드):', e.message);
  }
}

/**
 * 메모를 localStorage와 Supabase에 동시에 씁니다.
 */
export async function saveToCloud(userName, noteTitle, memo) {
  if (!isConfigured || !userName) return;
  const supabase = await getClient();
  if (!supabase) return;
  const ts = new Date().toISOString();
  localStorage.setItem(`_vaultMemoTS_${noteTitle}`, String(new Date(ts).getTime()));
  try {
    await supabase.from('vault_memos').upsert(
      { user_name: userName, note_title: noteTitle, memo, updated_at: ts },
      { onConflict: 'user_name,note_title' },
    );
  } catch (e) {
    console.warn('[vault:cloud] 저장 실패 (로컬에는 저장됨):', e.message);
  }
}
