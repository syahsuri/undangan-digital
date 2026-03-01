/**
 * ============================================================
 *  UCAPAN & DOA — Supabase Integration
 *  Cache: localStorage, refresh max once per 7 days
 *  OR immediately after a new comment is submitted.
 * ============================================================
 *
 *  SETUP INSTRUCTIONS
 *  ------------------
 *  1. Create a Supabase project at https://supabase.com
 *
 *  2. Run this SQL in the Supabase SQL Editor to create the table:
 *
 *     CREATE TABLE ucapan (
 *       id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 *       name       text    NOT NULL,
 *       presence   smallint NOT NULL DEFAULT 0,  -- 0=tdk konfirmasi, 1=hadir, 2=berhalangan
 *       comment    text    NOT NULL,
 *       created_at timestamptz DEFAULT now()
 *     );
 *
 *     -- Allow anyone to INSERT (submit wishes)
 *     ALTER TABLE ucapan ENABLE ROW LEVEL SECURITY;
 *
 *     CREATE POLICY "public insert" ON ucapan
 *       FOR INSERT TO anon WITH CHECK (true);
 *
 *     CREATE POLICY "public select" ON ucapan
 *       FOR SELECT TO anon USING (true);
 *
 *  3. Fill in your Supabase URL and anon key below (SUPABASE_URL, SUPABASE_KEY).
 *
 *  4. Add this script AFTER the Supabase CDN script in your HTML:
 *
 *     <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js"></script>
 *     <script src="ucapan-supabase.js"></script>
 *
 * ============================================================
 */

// ─── CONFIG ────────────────────────────────────────────────
const SUPABASE_URL = 'https://kzmjxmgykxwmfnnutehd.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt6bWp4bWd5a3h3bWZubnV0ZWhkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIzMjIyMjYsImV4cCI6MjA4Nzg5ODIyNn0.df5i5UvQw3wvxyGyLDrHlizFTW9_GftgXb48X_zg07k';

const CACHE_KEY        = 'ucapan_cache';
const CACHE_TS_KEY     = 'ucapan_cache_ts';
const CACHE_TTL_MS     = 7 * 24 * 60 * 60 * 1000; // 7 hari
// ────────────────────────────────────────────────────────────

const _supabase = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// ─── PRESENCE LABEL ────────────────────────────────────────
function presenceLabel(val) {
  if (val == 1) return '<span class="comment-presence">✅ Hadir</span>';
  if (val == 2) return '<span class="comment-presence">❌ Berhalangan</span>';
  return '';
}

// ─── RENDER COMMENTS ───────────────────────────────────────
function renderComments(items) {
  const container = document.getElementById('comments');
  if (!container) return;

  if (!items || items.length === 0) {
    container.innerHTML = '<p style="text-align:center;opacity:.5;font-size:.85rem;padding:1rem 0;">Belum ada ucapan. Jadilah yang pertama! 🤲</p>';
    return;
  }

  container.innerHTML = items.map(item => `
    <div class="comment-item">
      <div>
        <span class="comment-author">${escapeHtml(item.name)}</span>
        ${presenceLabel(item.presence)}
      </div>
      <p class="comment-text">${escapeHtml(item.comment)}</p>
    </div>
  `).join('');
}

// ─── LOAD COMMENTS (with cache) ────────────────────────────
async function loadComments(forceRefresh = false) {
  const now      = Date.now();
  const lastFetch = parseInt(localStorage.getItem(CACHE_TS_KEY) || '0', 10);
  const cached   = localStorage.getItem(CACHE_KEY);

  const cacheValid = cached && (now - lastFetch < CACHE_TTL_MS);

  if (!forceRefresh && cacheValid) {
    // Use cached data — no API call
    renderComments(JSON.parse(cached));
    return;
  }

  // Fetch from Supabase
  try {
    const { data, error } = await _supabase
      .from('ucapan')
      .select('id, name, presence, comment, created_at')
      .order('created_at', { ascending: false });

    if (error) throw error;

    // Update cache
    localStorage.setItem(CACHE_KEY, JSON.stringify(data));
    localStorage.setItem(CACHE_TS_KEY, String(Date.now()));

    renderComments(data);
  } catch (err) {
    console.error('[Ucapan] Gagal memuat ucapan:', err.message);
    // Fallback to cache even if expired
    if (cached) renderComments(JSON.parse(cached));
  }
}

// ─── SEND COMMENT ──────────────────────────────────────────
async function sendComment() {
  const nameEl     = document.getElementById('form-name');
  const presenceEl = document.getElementById('form-presence');
  const commentEl  = document.getElementById('form-comment');
  const btnEl      = document.getElementById('btn-send');

  const name     = nameEl.value.trim();
  const presence = parseInt(presenceEl.value, 10);
  const comment  = commentEl.value.trim();

  if (!name) {
    showUcapanToast('⚠️ Mohon isi nama Anda');
    nameEl.focus();
    return;
  }
  if (!comment) {
    showUcapanToast('⚠️ Mohon isi ucapan & doa');
    commentEl.focus();
    return;
  }

  // Disable button while sending
  btnEl.disabled = true;
  btnEl.innerHTML = '<i class="fa-solid fa-spinner fa-spin me-2"></i>Mengirim…';

  try {
    const { error } = await _supabase
      .from('ucapan')
      .insert([{ name, presence, comment }]);

    if (error) throw error;

    // Clear form
    nameEl.value      = '';
    presenceEl.value  = '0';
    commentEl.value   = '';

    showUcapanToast('✓ Ucapan terkirim! Jazakallahu khairan 🤲');

    // Force refresh so new comment appears and cache is updated
    await loadComments(true);

  } catch (err) {
    console.error('[Ucapan] Gagal mengirim:', err.message);
    showUcapanToast('❌ Gagal mengirim, coba lagi.');
  } finally {
    btnEl.disabled = false;
    btnEl.innerHTML = '<i class="fa-solid fa-paper-plane me-2"></i>Kirim Ucapan';
  }
}

// ─── TOAST ─────────────────────────────────────────────────
function showUcapanToast(msg) {
  // Try to reuse existing toast element from the page (generate-link.html style)
  let toast = document.getElementById('toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'ucapan-toast';
    toast.style.cssText = `
      position:fixed;bottom:2rem;left:50%;transform:translateX(-50%) translateY(20px);
      background:#1a5c44;border:1px solid #c9a84c;color:#f5e8b8;
      padding:.6rem 1.5rem;font-size:.8rem;letter-spacing:1px;
      opacity:0;transition:all .3s ease;pointer-events:none;
      white-space:nowrap;z-index:9999;
    `;
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  toast.style.opacity = '1';
  toast.style.transform = 'translateX(-50%) translateY(0)';
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(-50%) translateY(20px)';
  }, 2800);
}

// ─── UTILS ─────────────────────────────────────────────────
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/\n/g, '<br>');
}

// ─── INIT ──────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => loadComments());