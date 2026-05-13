/**
 * 小红书风格 User Study 前端交互逻辑
 * 结构：1个user + 10张专属图片，后端智能分配
 */

// ==================== 配置 ====================
const CONFIG = {
  assignUrl: '/api/assign',
  submitUrl: '/api/submit',
  storageKey: 'xhsc_userstudy_state',
};

// ==================== 全局状态 ====================
let questionnaire = null;   // { questionnaireId, user, images }
let currentStep = 'consent';
let currentImageIdx = 0;

// 评分数据存储结构
const ratings = {
  sectionA: { userId: '', A1: '', A2: '', A3: '', A4: '', comment: '' },
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

  const totalImages = questionnaire?.images?.length || 10;
  let pct = 0;

  if (currentStep === 'consent') pct = 5;
  else if (currentStep === 'sectionA-intro') pct = 10;
  else if (currentStep === 'profile') pct = 15;
  else if (currentStep === 'homepage') pct = 20;
  else if (currentStep === 'rating') pct = 30;
  else if (currentStep === 'sectionB-intro') pct = 40;
  else if (currentStep === 'image-judge') {
    pct = 45 + (currentImageIdx / totalImages) * 40;
  } else if (currentStep === 'postsurvey') pct = 90;
  else if (currentStep === 'debrief') pct = 100;

  bar.style.width = pct + '%';
}

// ==================== LocalStorage 自动保存 ====================
function saveState() {
  const state = {
    currentStep,
    currentImageIdx,
    questionnaireId: questionnaire?.questionnaireId,
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
    if (state.respondentId !== respondentId) return false;

    if (state.ratings) {
      Object.assign(ratings, state.ratings);
    }
    currentImageIdx = state.currentImageIdx || 0;

    // 恢复问卷ID（页面刷新后需要重新获取问卷数据）
    if (state.questionnaireId && !questionnaire) {
      // 标记为需要恢复
      return { step: state.currentStep, questionnaireId: state.questionnaireId };
    }

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

// ==================== 数据加载：调用 /api/assign ====================
async function assignQuestionnaire() {
  // 先尝试后端分配
  try {
    const res = await fetch(CONFIG.assignUrl, { method: 'POST' });
    if (res.ok) {
      questionnaire = await res.json();
      console.log('后端分配问卷:', questionnaire);
      if (questionnaire && questionnaire.user && questionnaire.images) {
        return true;
      }
    }
  } catch (err) {
    console.warn('后端分配失败，尝试本地fallback:', err);
  }

  // Fallback: 从本地 data.json 加载第一份问卷
  try {
    const res = await fetch('data/data.json');
    const data = await res.json();
    const users = data.sectionA_users || [];
    const allImages = data.sectionB_images || [];
    const qMap = data.questionnaire_map || {};

    if (users.length === 0) {
      alert('数据加载失败：没有用户数据');
      return false;
    }

    // 取第一个user
    const user = users[0];
    const imageIds = qMap[user.id] || [];
    const imgMap = Object.fromEntries(allImages.map(img => [img.id, img]));
    const images = imageIds.map(id => imgMap[id]).filter(Boolean);

    // 兜底：如果没凑够10张，补充其他图
    if (images.length < 10) {
      for (const img of allImages) {
        if (!images.includes(img) && images.length < 10) {
          images.push(img);
        }
      }
    }

    questionnaire = {
      questionnaireId: user.id,
      user: user,
      images: images.slice(0, 10),
    };
    console.log('本地fallback问卷:', questionnaire);
    return true;
  } catch (err) {
    alert('问卷加载失败，请检查网络后刷新页面重试。\n错误: ' + err.message);
    console.error(err);
    return false;
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
    showProfile();
  });
}

// --- Step 3: Profile 展示 ---
function showProfile() {
  const user = questionnaire.user;
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
  const user = questionnaire.user;
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
      <div class="post-thumb" data-post="${idx}">
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

  postsContainer.querySelectorAll('.post-thumb').forEach(thumb => {
    thumb.addEventListener('click', () => {
      const pIdx = parseInt(thumb.dataset.post);
      openPostModal(pIdx);
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
function openPostModal(postIdx) {
  const user = questionnaire.user;
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
  const container = $('#rating-questions');

  const questions = [
    { key: 'A1', text: '这名用户发布的帖子内容，与其个人资料（头像、简介、昵称等）所呈现的身份和兴趣相符合。' },
    { key: 'A2', text: '这10条帖子展示的生活方式和兴趣偏好，像是一个真实存在的人会拥有的，而不是编撰的。' },
    { key: 'A3', text: '每条帖子的文字内容和照片内容是相关的、互相呼应的。' },
    { key: 'A4', text: '这10条帖子之间能看出是同一个人的"生活记录"，而不是完全无关的内容拼凑。' },
  ];

  container.innerHTML = questions.map((q, qIdx) => {
    const saved = ratings.sectionA[q.key];
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
  $('#rating-comment').value = ratings.sectionA.comment || '';

  showStep('rating');
}

function initRating() {
  $('#btn-submit-rating').addEventListener('click', () => {
    const user = questionnaire.user;
    const userRating = {
      userId: user.id,
      A1: '', A2: '', A3: '', A4: '',
      comment: $('#rating-comment').value.trim(),
    };

    const keys = ['A1', 'A2', 'A3', 'A4'];
    for (const key of keys) {
      const checked = $(`input[name="rating-${key}"]:checked`);
      if (!checked) {
        alert('请完成所有评分题目。');
        return;
      }
      userRating[key] = parseInt(checked.value);
    }

    ratings.sectionA = userRating;
    saveState();

    // 进入 Section B
    showStep('sectionB-intro');
  });
}

// --- Step 6: Section B 介绍 ---
function initSectionBIntro() {
  $('#btn-sectionB-begin').addEventListener('click', () => {
    currentImageIdx = 0;
    showImageJudge();
  });
}

// --- Step 7: 单张图片判别 ---
function showImageJudge() {
  const img = questionnaire.images[currentImageIdx];
  const total = questionnaire.images.length;

  $('#judge-current').textContent = currentImageIdx + 1;
  $('#judge-total').textContent = total;
  $('#judge-image').src = img.url;

  // 恢复已选
  const saved = ratings.sectionB[currentImageIdx]?.value;
  $$(`input[name="judge"]`).forEach(r => {
    r.checked = saved == r.value;
  });

  // 更新按钮
  const btn = $('#btn-next-image');
  if (currentImageIdx >= total - 1) {
    btn.textContent = '完成图片判断 →';
  } else {
    btn.textContent = '下一张 →';
  }
  btn.disabled = !saved;

  // 更新选中样式
  $$(`input[name="judge"]`).forEach(rb => {
    rb.closest('.judge-option').classList.toggle('selected', rb.checked);
  });

  showStep('image-judge');
}

function initImageJudge() {
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

    const img = questionnaire.images[currentImageIdx];
    ratings.sectionB[currentImageIdx] = {
      imageId: img.id,
      value: parseInt(checked.value),
    };
    saveState();

    currentImageIdx++;
    if (currentImageIdx < questionnaire.images.length) {
      showImageJudge();
    } else {
      showStep('postsurvey');
    }
  });
}

// --- Step 8: 后测问卷 ---
function initPostsurvey() {
  if (ratings.postsurvey.q6) {
    $(`input[name="q6"][value="${ratings.postsurvey.q6}"]`).checked = true;
  }
  if (ratings.postsurvey.q9) {
    $(`input[name="q9"][value="${ratings.postsurvey.q9}"]`).checked = true;
  }

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
    questionnaireId: questionnaire.questionnaireId,
    timestamp: new Date().toISOString(),
    sectionA: ratings.sectionA,
    sectionB: ratings.sectionB,
    postsurvey: ratings.postsurvey,
  };

  let serverSuccess = false;
  let serverError = '';

  try {
    const res = await fetch(CONFIG.submitUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (data.success) {
      serverSuccess = true;
    } else {
      serverError = data.error || 'Unknown error';
    }
  } catch (err) {
    serverError = err.message;
  }

  showStep('debrief');
  const statusEl = $('#submit-status');
  const downloadBtn = $('#btn-download-csv');

  if (serverSuccess) {
    statusEl.className = 'submit-status success';
    statusEl.textContent = '✓ 问卷已成功提交到服务器，感谢参与！';
    clearState();
  } else {
    statusEl.className = 'submit-status error';
    statusEl.innerHTML = `提交到服务器失败（${serverError}）。<br>请点击下方按钮下载本地备份，并通过邮件/微信发回给研究者。`;
    downloadBtn.classList.remove('hidden');
  }

  downloadBtn.onclick = () => downloadCSV(payload);
}

function downloadCSV(payload) {
  const rows = [];
  const base = {
    受访者ID: payload.respondentId,
    分配问卷: payload.questionnaireId,
    提交时间: payload.timestamp,
  };

  // Section A
  const sa = payload.sectionA;
  rows.push({
    ...base,
    板块: 'SectionA',
    用户ID: sa.userId,
    A1_人设匹配: sa.A1,
    A2_生活逻辑: sa.A2,
    A3_图文匹配: sa.A3,
    A4_帖子连贯: sa.A4,
    开放题: sa.comment,
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
  // 清理旧版本可能残留的 localStorage 状态（旧版数据结构不兼容）
  try {
    const raw = localStorage.getItem(CONFIG.storageKey);
    if (raw) {
      const oldState = JSON.parse(raw);
      // 如果旧状态中的 sectionA 是数组（旧版结构），清除它
      if (oldState.ratings && Array.isArray(oldState.ratings.sectionA)) {
        console.log('检测到旧版 localStorage 状态，已清除');
        localStorage.removeItem(CONFIG.storageKey);
      }
    }
  } catch (e) { /* ignore */ }

  // 第一步：分配问卷
  const assigned = await assignQuestionnaire();
  if (!assigned) return;

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
  const restored = loadState();
  if (restored && typeof restored === 'object') {
    // 需要恢复的问卷ID与当前分配的一致才能继续
    if (restored.questionnaireId === questionnaire.questionnaireId) {
      const go = confirm('检测到你有未完成的问卷，是否从上次离开的地方继续？');
      if (go) {
        if (restored.step === 'profile') showProfile();
        else if (restored.step === 'homepage') showHomepage();
        else if (restored.step === 'rating') showRating();
        else if (restored.step === 'sectionB-intro') showStep('sectionB-intro');
        else if (restored.step === 'image-judge') showImageJudge();
        else if (restored.step === 'postsurvey') showStep('postsurvey');
        else showStep(restored.step);
        return;
      }
    }
  } else if (restored && restored !== 'consent' && restored !== 'debrief') {
    const go = confirm('检测到你有未完成的问卷，是否从上次离开的地方继续？');
    if (go) {
      if (restored === 'profile') showProfile();
      else if (restored === 'homepage') showHomepage();
      else if (restored === 'rating') showRating();
      else if (restored === 'sectionB-intro') showStep('sectionB-intro');
      else if (restored === 'image-judge') showImageJudge();
      else if (restored === 'postsurvey') showStep('postsurvey');
      else showStep(restored);
      return;
    }
  }

  // 默认从 consent 开始
  showStep('consent');
}

// 启动
document.addEventListener('DOMContentLoaded', init);
