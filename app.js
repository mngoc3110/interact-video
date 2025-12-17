const video = document.getElementById("video");
const overlay = document.getElementById("overlay");
const titleEl = document.getElementById("title");
const qIndexEl = document.getElementById("qIndex");
const timerEl = document.getElementById("timer");
const questionEl = document.getElementById("question");
const choicesEl = document.getElementById("choices");
const feedbackEl = document.getElementById("feedback");
const continueBtn = document.getElementById("continueBtn");
const restartBtn = document.getElementById("restartBtn");
const scoreEl = document.getElementById("score");
const statusEl = document.getElementById("status");
const scormDebugEl = document.getElementById("scormDebug");

let cfg = null;
let asked = new Set();
let score = 0;
let timer = null;
let timeLeft = 0;
let inQuestion = false;

// ---- Anti-seek state ----
let lastAllowedTime = 0;     // mốc thời gian hợp lệ cuối cùng
let blockSeek = false;       // bật/tắt anti-seek
let isProgrammaticSeek = false; // tránh vòng lặp khi ta tự set currentTime

function show(el) { el.classList.remove("hidden"); }
function hide(el) { el.classList.add("hidden"); }

async function loadConfig() {
  const res = await fetch("./interactions.json", { cache: "no-store" });
  cfg = await res.json();

  titleEl.textContent = cfg.title || "Bài giảng video tương tác";
  updateScore();

  // bật chặn tua nếu cấu hình
  blockSeek = !!cfg?.settings?.disableSeeking;

  initScormSession();
  commitScormProgress();
  updateScormDebug();
}

function updateScore() {
  if (!cfg?.settings?.showScore) { scoreEl.textContent = ""; return; }
  const total = cfg?.interactions?.length ?? 0;
  scoreEl.textContent = `Điểm: ${score}/${total}`;
}

function openQuestion(q, qNumber, total) {
  inQuestion = true;
  video.pause();

  show(overlay);
  feedbackEl.textContent = "";
  continueBtn.classList.add("hidden");

  qIndexEl.textContent = `Câu ${qNumber}/${total}`;
  questionEl.textContent = q.prompt;

  choicesEl.innerHTML = "";
  q.choices.forEach((text, i) => {
    const btn = document.createElement("button");
    btn.className = "choice";
    btn.textContent = text;
    btn.onclick = () => answer(q, i);
    choicesEl.appendChild(btn);
  });

  stopTimer();
  const limit = cfg?.settings?.timeLimitSec ?? 0;
  if (limit > 0) startTimer(limit, () => {
    feedbackEl.textContent = "Hết giờ. Bạn phải làm lại.";
    handleWrong();
  });
}

function answer(q, choiceIndex) {
  const buttons = [...choicesEl.querySelectorAll("button.choice")];
  buttons.forEach(b => (b.disabled = true));

  stopTimer();

  const requireCorrect = !!cfg?.settings?.requireCorrectToContinue;
  const correct = choiceIndex === q.correctIndex;

  if (correct) {
    score += 1;
    feedbackEl.textContent = `✅ Đúng! ${q.explain ?? ""}`.trim();
    updateScore();
    continueBtn.classList.remove("hidden");

    commitScormProgress();
    updateScormDebug();
  } else {
    feedbackEl.textContent = `❌ Sai. ${q.explain ?? ""}`.trim();

    if (requireCorrect) {
      handleWrong();
    } else {
      continueBtn.classList.remove("hidden");
    }

    commitScormProgress();
    updateScormDebug();
  }
}

function handleWrong() {
  const wrongAction = cfg?.settings?.wrongAction || "restart";
  continueBtn.classList.add("hidden");

  if (wrongAction === "restart") {
    setTimeout(() => {
      asked = new Set();
      score = 0;
      updateScore();

      hide(overlay);
      inQuestion = false;

      // reset anti-seek baseline
      lastAllowedTime = 0;

      safeSeekTo(0);
      video.play();

      commitScormProgress();
      updateScormDebug();
    }, 600);
  } else if (wrongAction === "retry") {
    const buttons = [...choicesEl.querySelectorAll("button.choice")];
    setTimeout(() => buttons.forEach(b => (b.disabled = false)), 300);
  } else {
    setTimeout(() => {
      asked = new Set();
      score = 0;
      updateScore();

      hide(overlay);
      inQuestion = false;

      lastAllowedTime = 0;

      safeSeekTo(0);
      video.play();
    }, 600);
  }
}

function closeQuestion() {
  hide(overlay);
  feedbackEl.textContent = "";
  stopTimer();
  inQuestion = false;
  video.play();
}

function startTimer(sec, onEnd) {
  timeLeft = sec;
  timerEl.textContent = `⏱️ ${timeLeft}s`;
  timer = setInterval(() => {
    timeLeft -= 1;
    timerEl.textContent = `⏱️ ${timeLeft}s`;
    if (timeLeft <= 0) {
      stopTimer();
      onEnd?.();
    }
  }, 1000);
}

function stopTimer() {
  if (timer) clearInterval(timer);
  timer = null;
  timerEl.textContent = "";
}

// ✅ FIX: không lọt mốc
function checkInteractions() {
  if (!cfg?.interactions?.length) return;
  if (inQuestion) return;

  const t = video.currentTime;
  const total = cfg.interactions.length;

  for (let i = 0; i < cfg.interactions.length; i++) {
    const q = cfg.interactions[i];
    if (asked.has(q.id)) continue;

    if (t >= q.time) {
      asked.add(q.id);
      openQuestion(q, i + 1, total);
      break;
    }
  }
}

/* ---------------- Anti-seek ----------------
   Chặn mọi thao tác tua (kéo thanh thời gian, nhảy time).
   - Cập nhật lastAllowedTime liên tục khi video chạy.
   - Nếu user seek -> kéo về lastAllowedTime.
*/
function safeSeekTo(t) {
  isProgrammaticSeek = true;
  video.currentTime = t;
  // thả cờ sau 1 tick
  setTimeout(() => { isProgrammaticSeek = false; }, 0);
}

function onTimeUpdateForSeekLock() {
  if (!blockSeek) return;

  // Khi đang hỏi thì không cập nhật baseline (tránh “cho phép” vượt qua mốc)
  if (inQuestion) return;

  // Baseline = thời gian hiện tại (cho phép tiến dần)
  lastAllowedTime = video.currentTime;
}

function onSeekingBlock() {
  if (!blockSeek) return;
  if (isProgrammaticSeek) return;

  // Nếu đang hiện câu hỏi: không cho nhảy đi đâu cả
  if (inQuestion) {
    safeSeekTo(lastAllowedTime);
    return;
  }

  // Chặn mọi seek: kéo về lastAllowedTime
  // (vì bạn nói “không được tua” = cấm tua cả tới và lui)
  safeSeekTo(lastAllowedTime);
}

/* ---------------- SCORM 1.2 ---------------- */
function initScormSession() {
  const ok = window.SCORM12?.init?.() ?? false;
  statusEl.textContent = ok && window.SCORM12?.hasLMS ? "SCORM: connected" : "SCORM: preview mode";

  if (ok && window.SCORM12?.hasLMS) {
    const cur = window.SCORM12.get("cmi.core.lesson_status");
    if (!cur) window.SCORM12.set("cmi.core.lesson_status", "incomplete");
    window.SCORM12.commit();
  }
}

function commitScormProgress() {
  if (!window.SCORM12?.hasLMS) return;

  const total = cfg?.interactions?.length ?? 0;
  const percent = total ? Math.round((score / total) * 100) : 0;

  window.SCORM12.set("cmi.core.score.raw", percent);
  window.SCORM12.set("cmi.core.score.min", 0);
  window.SCORM12.set("cmi.core.score.max", 100);

  const mastery = cfg?.settings?.masteryScore ?? 70;
  const answeredAll = (asked.size >= total);

  if (answeredAll) {
    window.SCORM12.set("cmi.core.lesson_status", percent >= mastery ? "passed" : "failed");
  } else {
    window.SCORM12.set("cmi.core.lesson_status", "incomplete");
  }

  const suspend = JSON.stringify({ asked: Array.from(asked), score });
  window.SCORM12.set("cmi.suspend_data", suspend.slice(0, 3500));

  window.SCORM12.commit();
}

function updateScormDebug() {
  const info = {
    hasLMS: !!window.SCORM12?.hasLMS,
    lesson_status: window.SCORM12?.hasLMS ? window.SCORM12.get("cmi.core.lesson_status") : "(preview)",
    score_raw: window.SCORM12?.hasLMS ? window.SCORM12.get("cmi.core.score.raw") : "(preview)",
    suspend_data: window.SCORM12?.hasLMS ? (window.SCORM12.get("cmi.suspend_data") || "").slice(0, 120) : "(preview)",
    disableSeeking: blockSeek,
    lastAllowedTime: Math.round(lastAllowedTime * 100) / 100
  };
  scormDebugEl.textContent = JSON.stringify(info, null, 2);
}

/* --------------- Controls --------------- */
continueBtn.addEventListener("click", closeQuestion);

restartBtn.addEventListener("click", () => {
  asked = new Set();
  score = 0;
  updateScore();

  hide(overlay);
  inQuestion = false;

  lastAllowedTime = 0;

  safeSeekTo(0);
  video.play();

  commitScormProgress();
  updateScormDebug();
});

// events
video.addEventListener("timeupdate", checkInteractions);
video.addEventListener("timeupdate", onTimeUpdateForSeekLock);
video.addEventListener("seeking", onSeekingBlock);

loadConfig();