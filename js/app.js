/**
 * 小红书风格 User Study 前端交互逻辑
 */

// ==================== 配置 ====================
const CONFIG = {
  dataUrl: 'data/data.json',
  submitUrl: '/api/submit',
  storageKey: 'xhsc_userstudy_state',
};

// ==================== 全局状态 ====================
let appData = null;
let currentStep = 'consent';
let currentUserIdx = 0;
let currentImageIdx = 0;

// 评分数据存储结构
const ratings = {
  sectionA: [],   // [{ userId, A1, A2, A3, A4, A5, comment }]
  sectionB: [],   // [{ imageId, value }]
  postsurvey: { q6: '', q9: '' },
};

// 生成匿名受访者ID
const respondentId = localStorage.getItem('xhsc_respondent_id') ||
  'resp_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
localStorage.setItem('xhsc_respondent_id', respondentId);

// ==================== 工具函数 ====================
function $(sel) { return document.querySelector(sel); }
function $$(sel) { return document.querySelectorAll(sel); }

function showStep(stepName) {
  $$('.step').forEach(el => el.classList.add('hidden'));
  $(`#step-${stepName}`).classList.remove('hidden');
  currentStep = stepName;
  saveState();
  updateProgress();
  window.scrollTo(0, 0);

  // 进度条显示控制
  const progressBar = $('#progress-bar');
  if (stepName === 'consent') {
    progressBar.classList.add('hidden');
  } else {
    progressBar.classList.remove('hidden');
  }
}

function updateProgress() {
  const bar = $('#progress-fill');
  if (!bar) return;

  const steps = [
    'consent', 'sectionA-intro', 'profile', 'homepage', 'rating',
    'sectionB-intro', 'image-judge', 'postsurvey', 'debrief'
  ];

  let pct = 0;
  if (currentStep === 'consent') pct = 5;
  else if (currentStep === 'sectionA-intro') pct = 8;
  else if (currentStep === 'profile') {
    pct = 10 + (currentUserIdx / (appData?.sectionA_users?.length || 5)) * 35;
  } else if (currentStep === 'homepage') {
    pct = 12 + (currentUserIdx / (appData?.sectionA_users?.length || 5)) * 35;
  } else if (currentStep === 'rating') {
    pct = 15 + (currentUserIdx / (appData?.sectionA_users?.length || 5)) * 35;
  } else if (currentStep === 'sectionB-intro') pct = 50;
  else if (currentStep === 'image-judge') {
    pct = 55 + (currentImageIdx / (appData?.sectionB_images?.length || 30)) * 30;
  } else if (currentStep === 'postsurvey') pct = 90;
  else if (currentStep === 'debrief') pct = 100;

  bar.style.width = pct + '%';
}

// ==================== LocalStorage 自动保存 ====================
function saveState() {
  const state = {
    currentStep,
    currentUserIdx,
    currentImageIdx,
    ratings,
    respondentId,
  };
  localStorage.setItem(CONFIG.storageKey, JSON.stringify(state));
}

function loadState() {
  try {
    const raw = localStorage.getItem(CONFIG.storageKey);
    if (!raw) return false;
    const state = JSON.parse(raw);
    if (state.respondentId !== respondentId) return false; // 不同浏览器/清除过缓存

    // 恢复状态
    if (state.ratings) {
      Object.assign(ratings, state.ratings);
    }
    currentUserIdx = state.currentUserIdx || 0;
    currentImageIdx = state.currentImageIdx || 0;

    // 如果已经到 debrief，说明已完成，不恢复
    if (state.currentStep === 'debrief') {
      localStorage.removeItem(CONFIG.storageKey);
      return false;
    }

    return state.currentStep || 'consent';
  } catch (e) {
    return false;
  }
}

function clearState() {
  localStorage.removeItem(CONFIG.storageKey);
}

// ==================== 数据加载 ====================
async function loadData() {
  try {
    const res = await fetch(CONFIG.dataUrl);
    appData = await res.json();
    console.log('Data loaded:', appData);
  } catch (err) {
    alert('数据加载失败，请刷新页面重试。');
    console.error(err);
  }
}

// ==================== Step 渲染函数 ====================

// --- Step 1: 知情同意 ---
function initConsent() {
  const ageBox = $('#consent-age');
  const dataBox = $('#consent-data');
  const btn = $('#btn-start');

  function check() {
    btn.disabled = !(ageBox.checked && dataBox.checked);
  }
  ageBox.addEventListener('change', check);
  dataBox.addEventListener('change', check);

  btn.addEventListener('click', () => {
    showStep('sectionA-intro');
  });
}

// --- Step 2: Section A 介绍 ---
function initSectionAIntro() {
  $('#btn-sectionA-begin').addEventListener('click', () => {
    currentUserIdx = 0;
    showProfile();
  });
}

// --- Step 3: Profile 展示 ---
function showProfile() {
  const user = appData.sectionA_users[currentUserIdx];
  const container = $('#profile-content');

  container.innerHTML = `
    <div class="profile-card">
      <img class="profile-avatar" src="${user.avatar}" alt="${user.nickname}">
      <div class="profile-nickname">${user.nickname}</div>
      <div class="profile-meta">${user.profile.age}岁 · ${user.profile.occupation} · ${user.profile.location}</div>
      <div class="profile-bio">${user.profile.bio}</div>
      <div class="profile-detail">
        <div class="profile-detail-item">
          <span class="profile-detail-label">兴趣爱好</span>
          <span class="profile-detail-value">${user.profile.interests.join('、')}</span>
        </div>
        <div class="profile-detail-item">
          <span class="profile-detail-label">性格特点</span>
          <span class="profile-detail-value">${user.profile.personality}</span>
        </div>
      </div>
    </div>
  `;

  showStep('profile');
}

function initProfile() {
  $('#btn-view-homepage').addEventListener('click', showHomepage);
}

// --- Step 4: 用户主页展示 ---
function showHomepage() {
  const user = appData.sectionA_users[currentUserIdx];
  const header = $('#homepage-header');
  const postsContainer = $('#homepage-posts');

  header.innerHTML = `
    <img class="homepage-avatar" src="${user.avatar}" alt="${user.nickname}">
    <div class="homepage-info">
      <div class="homepage-nickname">${user.nickname}</div>
      <div class="homepage-stats">
        <span>${user.posts.length} 笔记</span>
        <span>${user.following} 关注</span>
        <span>${user.followers} 粉丝</span>
      </div>
    </div>
  `;

  postsContainer.innerHTML = user.posts.map((post, idx) => {
    const firstImg = post.images[0];
    return `
      <div class="post-thumb" data-user="${currentUserIdx}" data-post="${idx}">
        <img src="${firstImg}" alt="帖子图片" loading="lazy">
        ${post.images.length > 1 ? `
          <div class="post-thumb-overlay">
            <svg viewBox="0 0 24 24" fill="currentColor"><path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"/></svg>
            ${post.images.length}
          </div>
        ` : ''}
      </div>
    `;
  }).join('');

  // 绑定帖子点击事件
  postsContainer.querySelectorAll('.post-thumb').forEach(thumb => {
    thumb.addEventListener('click', () => {
      const uIdx = parseInt(thumb.dataset.user);
      const pIdx = parseInt(thumb.dataset.post);
      openPostModal(uIdx, pIdx);
    });
  });

  showStep('homepage');
}

function initHomepage() {
  $('#btn-back-profile').addEventListener('click', () => {
    showProfile();
  });
  $('#btn-ready-rate').addEventListener('click', showRating);
}

// 帖子详情弹窗
function openPostModal(userIdx, postIdx) {
  const user = appData.sectionA_users[userIdx];
  const post = user.posts[postIdx];
  const modal = $('#post-modal');
  const body = $('#modal-body');

  body.innerHTML = `
    ${post.images.map(img => `<img class="modal-image" src="${img}" alt="帖子图片" loading="lazy">`).join('')}
    <div class="modal-text-box">
      <div class="modal-text">${post.text}</div>
      <div class="modal-meta">
        <span>❤ ${post.likes}</span>
        <span>💬 ${post.comments}</span>
      </div>
    </div>
  `;

  modal.classList.remove('hidden');
  document.body.style.overflow = 'hidden';
}

function closePostModal() {
  $('#post-modal').classList.add('hidden');
  document.body.style.overflow = '';
}

// --- Step 5: 评分页面 ---
function showRating() {
  const user = appData.sectionA_users[currentUserIdx];
  const container = $('#rating-questions');
  $('#rating-user-num').textContent = currentUserIdx + 1;

  const questions = [
    { key: 'A1', text: '你认为这名用户发的帖子是自然的，他应该会发这些内容吗？' },
    { key: 'A2', text: '这个用户发的帖子内容，和ta的个人资料给人的感觉是一致的。' },
    { key: 'A3', text: '这10条帖子展示的生活方式和兴趣偏好，像是一个真实存在的人会拥有的。' },
    { key: 'A4', text: '每条帖子的文字内容和照片内容是相关的、互相呼应的。' },
    { key: 'A5', text: '这10条帖子之间能看出是同一个人的"生活记录"，而不是完全无关的内容拼凑。' },
  ];

  container.innerHTML = questions.map((q, qIdx) => {
    const saved = ratings.sectionA[currentUserIdx]?.[q.key];
    return `
      <div class="rating-item" data-key="${q.key}">
        <div class="rating-label">${qIdx + 1}. ${q.text}</div>
        <div class="rating-scale">
          ${[1,2,3,4,5].map(val => {
            const labels = {1:'非常不赞同', 2:'不太赞同', 3:'一般', 4:'比较赞同', 5:'非常赞同'};
            return `
            <label>
              <input type="radio" name="rating-${q.key}" value="${val}" ${saved == val ? 'checked' : ''}>
              <span class="scale-num">${val}</span>
              <span class="scale-text">${labels[val]}</span>
            </label>
          `}).join('')}
        </div>
      </div>
    `;
  }).join('');

  // 恢复开放题
  const savedComment = ratings.sectionA[currentUserIdx]?.comment || '';
  $('#rating-comment').value = savedComment;

  showStep('rating');
}

function initRating() {
  $('#btn-submit-rating').addEventListener('click', () => {
    // 收集评分
    const user = appData.sectionA_users[currentUserIdx];
    const userRating = {
      userId: user.id,
      A1: '', A2: '', A3: '', A4: '', A5: '',
      comment: $('#rating-comment').value.trim(),
    };

    const keys = ['A1', 'A2', 'A3', 'A4', 'A5'];
    for (const key of keys) {
      const checked = $(`input[name="rating-${key}"]:checked`);
      if (!checked) {
        alert('请完成所有评分题目。');
        return;
      }
      userRating[key] = parseInt(checked.value);
    }

    ratings.sectionA[currentUserIdx] = userRating;
    saveState();

    // 下一个用户或进入Section B
    currentUserIdx++;
    if (currentUserIdx < appData.sectionA_users.length) {
      showProfile();
    } else {
      showStep('sectionB-intro');
    }
  });
}

// --- Step 6: Section B 介绍 ---
function initSectionBIntro() {
  $('#btn-sectionB-begin').addEventListener('click', () => {
    currentImageIdx = 0;
    showImageJudge();
  });
}

// --- Step 7-9: 图片判别 ---
function showImageJudge() {
  const img = appData.sectionB_images[currentImageIdx];
  $('#judge-current').textContent = currentImageIdx + 1;
  $('#judge-total').textContent = appData.sectionB_images.length;
  $('#judge-image').src = img.url;

  // 恢复已选
  const saved = ratings.sectionB[currentImageIdx]?.value;
  $$(`input[name="judge"]`).forEach(r => {
    r.checked = saved == r.value;
  });

  // 更新按钮文字
  const btn = $('#btn-next-image');
  if (currentImageIdx >= appData.sectionB_images.length - 1) {
    btn.textContent = '完成图片判断 →';
  } else {
    btn.textContent = '下一张 →';
  }
  btn.disabled = !saved;

  showStep('image-judge');
}

function initImageJudge() {
  // 选项变化时启用按钮 + 添加选中样式（:has() fallback）
  $$(`input[name="judge"]`).forEach(r => {
    r.addEventListener('change', () => {
      $('#btn-next-image').disabled = false;
      $$(`input[name="judge"]`).forEach(rb => {
        rb.closest('.judge-option').classList.toggle('selected', rb.checked);
      });
    });
  });

  $('#btn-next-image').addEventListener('click', () => {
    const checked = $(`input[name="judge"]:checked`);
    if (!checked) return;

    const img = appData.sectionB_images[currentImageIdx];
    ratings.sectionB[currentImageIdx] = {
      imageId: img.id,
      value: parseInt(checked.value),
    };
    saveState();

    currentImageIdx++;
    if (currentImageIdx < appData.sectionB_images.length) {
      showImageJudge();
    } else {
      showStep('postsurvey');
    }
  });
}

// --- Step 10: 后测问卷 ---
function initPostsurvey() {
  // 恢复已选
  if (ratings.postsurvey.q6) {
    $(`input[name="q6"][value="${ratings.postsurvey.q6}"]`).checked = true;
  }
  if (ratings.postsurvey.q9) {
    $(`input[name="q9"][value="${ratings.postsurvey.q9}"]`).checked = true;
  }

  // 监听变化自动保存
  $$('input[name="q6"]').forEach(r => {
    r.addEventListener('change', () => {
      ratings.postsurvey.q6 = r.value;
      saveState();
      $$('input[name="q6"]').forEach(rb => {
        rb.closest('.survey-option').classList.toggle('selected', rb.checked);
      });
    });
  });
  $$('input[name="q9"]').forEach(r => {
    r.addEventListener('change', () => {
      ratings.postsurvey.q9 = r.value;
      saveState();
    });
  });

  $('#btn-submit-all').addEventListener('click', () => {
    if (!ratings.postsurvey.q6 || !ratings.postsurvey.q9) {
      alert('请完成后测问卷的所有题目。');
      return;
    }
    submitAll();
  });
}

// ==================== 提交逻辑 ====================
async function submitAll() {
  const btn = $('#btn-submit-all');
  btn.disabled = true;
  btn.textContent = '提交中...';

  const payload = {
    respondentId,
    timestamp: new Date().toISOString(),
    sectionA: ratings.sectionA,
    sectionB: ratings.sectionB,
    postsurvey: ratings.postsurvey,
  };

  let feishuSuccess = false;
  let feishuError = '';

  // 尝试提交到飞书
  try {
    const res = await fetch(CONFIG.submitUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (data.success) {
      feishuSuccess = true;
    } else {
      feishuError = data.error || 'Unknown error';
    }
  } catch (err) {
    feishuError = err.message;
  }

  // 显示结果
  showStep('debrief');
  const statusEl = $('#submit-status');
  const downloadBtn = $('#btn-download-csv');

  if (feishuSuccess) {
    statusEl.className = 'submit-status success';
    statusEl.textContent = '✓ 问卷已成功提交到服务器，感谢参与！';
    clearState();
  } else {
    statusEl.className = 'submit-status error';
    statusEl.innerHTML = `提交到服务器失败（${feishuError}）。<br>请点击下方按钮下载本地备份，并通过邮件/微信发回给研究者。`;
    downloadBtn.classList.remove('hidden');
  }

  // CSV 下载功能
  downloadBtn.onclick = () => downloadCSV(payload);
}

function downloadCSV(payload) {
  // 构建扁平化的 CSV
  const rows = [];
  const base = {
    受访者ID: payload.respondentId,
    提交时间: payload.timestamp,
  };

  // Section A
  payload.sectionA.forEach((r, i) => {
    rows.push({
      ...base,
      板块: 'SectionA',
      用户序号: i + 1,
      用户ID: r.userId,
      A1_整体自然度: r.A1,
      A2_人设匹配: r.A2,
      A3_生活逻辑: r.A3,
      A4_图文匹配: r.A4,
      A5_帖子连贯: r.A5,
      开放题: r.comment,
    });
  });

  // Section B
  payload.sectionB.forEach((r, i) => {
    rows.push({
      ...base,
      板块: 'SectionB',
      图片序号: i + 1,
      图片ID: r.imageId,
      判别结果: r.value,
    });
  });

  // 后测
  rows.push({
    ...base,
    板块: 'Postsurvey',
    Q6_小红书使用频率: payload.postsurvey.q6,
    Q9_判别自信度: payload.postsurvey.q9,
  });

  // 转 CSV
  if (rows.length === 0) return;
  const headers = Object.keys(rows[0]);
  const csv = [
    headers.join(','),
    ...rows.map(row => headers.map(h => {
      const v = row[h] ?? '';
      const s = String(v).replace(/"/g, '\\"');
      return s.includes(',') || s.includes('\n') ? `"${s}"` : s;
    }).join(',')),
  ].join('\n');

  const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `userstudy_${payload.respondentId}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ==================== 初始化 ====================
async function init() {
  await loadData();
  if (!appData) return;

  // 绑定弹窗关闭
  $('#btn-close-modal').addEventListener('click', closePostModal);
  $('#post-modal').addEventListener('click', (e) => {
    if (e.target === $('#post-modal')) closePostModal();
  });

  // 初始化各 step 事件
  initConsent();
  initSectionAIntro();
  initProfile();
  initHomepage();
  initRating();
  initSectionBIntro();
  initImageJudge();
  initPostsurvey();

  // 尝试恢复状态
  const restoredStep = loadState();
  if (restoredStep && restoredStep !== 'consent' && restoredStep !== 'debrief') {
    const go = confirm('检测到你有未完成的问卷，是否从上次离开的地方继续？');
    if (go) {
      // 根据恢复的状态跳到对应步骤
      if (restoredStep === 'profile') showProfile();
      else if (restoredStep === 'homepage') showHomepage();
      else if (restoredStep === 'rating') showRating();
      else if (restoredStep === 'sectionB-intro') showStep('sectionB-intro');
      else if (restoredStep === 'image-judge') showImageJudge();
      else if (restoredStep === 'postsurvey') showStep('postsurvey');
      else showStep(restoredStep);
      return;
    }
  }

  // 默认从 consent 开始
  showStep('consent');
}

// 启动
document.addEventListener('DOMContentLoaded', init);
