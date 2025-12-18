const video = document.getElementById("video");
const startOverlay = document.getElementById("startOverlay");
const startBtn = document.getElementById("startBtn");
const exitBtn = document.getElementById("exitBtn");
const playPauseBtn = document.getElementById("playPauseBtn");

const overlay = document.getElementById("overlay");
const questionEl = document.getElementById("question");
const choicesEl = document.getElementById("choices");
const continueBtn = document.getElementById("continueBtn");
const feedbackEl = document.getElementById("feedback");
const scoreEl = document.getElementById("score");
const titleEl = document.getElementById("title");

let data, asked = new Set(), score = 0;
let started = false, completed = false;
let lastAllowedTime = 0, forceSeek = false;

/* LOAD DATA */
fetch("interactions.json").then(r=>r.json()).then(j=>{
  data = j;
  titleEl.innerText = j.title;
});

/* FULLSCREEN */
function enterFullscreen(){
  document.documentElement.requestFullscreen?.();
}

/* START */
startBtn.onclick = async ()=>{
  enterFullscreen();
  startOverlay.style.display="none";
  started = true;
  await video.play().catch(()=>{});
};

/* PLAY / PAUSE */
playPauseBtn.onclick = async ()=>{
  if(video.paused){
    await video.play().catch(()=>{});
  }else{
    video.pause();
  }
};
video.onplay = ()=>playPauseBtn.innerText="Pause";
video.onpause = ()=>playPauseBtn.innerText="Play";

/* CHỐNG TUA */
video.addEventListener("timeupdate", ()=>{
  if(!started || completed) return;

  if(video.currentTime > lastAllowedTime){
    lastAllowedTime = video.currentTime;
  }

  data.interactions.forEach((q,i)=>{
    if(!asked.has(q.id) && video.currentTime >= q.time){
      asked.add(q.id);
      showQuestion(q,i+1,data.interactions.length);
    }
  });

  if(asked.size === data.interactions.length){
    completed = true;
    exitBtn.classList.remove("hidden");
  }
});

video.addEventListener("seeking", ()=>{
  if(!completed){
    forceSeek = true;
    video.currentTime = lastAllowedTime;
    setTimeout(()=>forceSeek=false,0);
  }
});

/* CHẶN PHÍM TUA */
document.addEventListener("keydown",e=>{
  if(["ArrowLeft","ArrowRight","j","k","l","J","K","L"].includes(e.key)){
    e.preventDefault();
  }
});

/* QUESTION */
function showQuestion(q,idx,total){
  video.pause();
  overlay.classList.remove("hidden");
  questionEl.innerText = `Câu ${idx}/${total}: ${q.question}`;
  choicesEl.innerHTML="";
  feedbackEl.innerText="";
  continueBtn.classList.add("hidden");

  q.choices.forEach((c,i)=>{
    const b=document.createElement("button");
    b.innerText=c;
    b.onclick=()=>{
      if(i===q.correct){
        score++;
        scoreEl.innerText=`Điểm: ${score}/${total}`;
        continueBtn.classList.remove("hidden");
        feedbackEl.innerText="✅ Đúng";
      }else{
        location.reload(); // SAI → LÀM LẠI
      }
    };
    choicesEl.appendChild(b);
  });
}

continueBtn.onclick=()=>{
  overlay.classList.add("hidden");
  video.play();
};

/* EXIT */
exitBtn.onclick=()=>{
  document.exitFullscreen?.();
};
