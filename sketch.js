/* ==========================================
   Minty Heart - 无高光纯净版 (最终版)
   ========================================== */

let handPose;
let video;
let hands = [];
let isModelReady = false;

// --- 颜色配置 ---
let themeColors = {
  mint: { main: [120, 255, 190], dark: [30, 160, 100], glow: [100, 255, 180], text: '#b3ffd9' },
  pink: { main: [255, 153, 204], dark: [200, 80, 130], glow: [255, 121, 198], text: '#ffb8d9' },
  blue: { main: [102, 204, 255], dark: [40, 130, 200], glow: [139, 233, 253], text: '#b3e0ff' }
};
let currentTheme = 'mint';
let targetMainColor, targetDarkColor, targetGlowColor;
let currentMainColor, currentDarkColor, currentGlowColor;

// --- 物理参数 ---
let baseScale = 16; 
let cx, cy;             
let n = 200;            
let baseX = [], baseY = []; 
let bgX = [], bgY = [];     
let smX = [], smY = [];     

let offX = [], offY = [];   
let vX = [], vY = [];       
let targetArea = 0; 

const SPRING = 0.12;     
const DAMPING = 0.82;   

// --- 捏合检测 ---
const PINCH_THRESHOLD = 40;   
const INFLUENCE_RADIUS = 150; 
let isPinching = false;
let pinchX = 0, pinchY = 0;

// --- 小爱心与背景 ---
let lastPinching = false; 
let dragStartX = 0, dragStartY = 0;
let smallHearts = []; 
let bgHearts = [];
let stars = [];

// --- 音频系统 ---
let audioReady = false;
let heartOsc, popOsc; 
let lastBeatTime = 0;    

function preload() {
  ml5.setBackend("webgl");
  handPose = ml5.handPose({ flipped: true });
}

// 保留你接受的经典心形公式
function getHeartPoints(scale) {
  let pts = [];
  for (let i = 0; i < n; i++) {
    let t = (i / n) * TWO_PI;
    let hx = 16 * pow(sin(t), 3) * 1.2; 
    let hy = -(13 * cos(t) - 5 * cos(2*t) - 2 * cos(3*t) - cos(4*t)) * 0.9; 
    pts.push({ x: hx * scale, y: hy * scale });
  }
  
  for (let k = 0; k < 6; k++) {
    let temp = [];
    for (let i = 0; i < n; i++) {
      let prev = (i - 1 + n) % n;
      let next = (i + 1) % n;
      temp[i] = {
        x: (pts[prev].x + pts[i].x * 2 + pts[next].x) / 4,
        y: (pts[prev].y + pts[i].y * 2 + pts[next].y) / 4
      };
    }
    pts = temp;
  }
  return pts;
}

async function setup() {
  createCanvas(960, 640);
  cx = width / 2;
  cy = height / 2;

  updateThemeColors('mint');

  let mainPts = getHeartPoints(baseScale);
  for (let i = 0; i < n; i++) {
    baseX[i] = mainPts[i].x; baseY[i] = mainPts[i].y;
    offX[i] = 0; offY[i] = 0; vX[i] = 0; vY[i] = 0;
  }
  targetArea = calculateArea();

  let bgPts = getHeartPoints(1.0); 
  for (let i = 0; i < n; i++) { bgX[i] = bgPts[i].x; bgY[i] = bgPts[i].y; }

  let smPts = getHeartPoints(0.8); 
  for (let i = 0; i < n; i++) { smX[i] = smPts[i].x; smY[i] = smPts[i].y; }

  for (let i = 0; i < 100; i++) stars.push({x: random(width), y: random(height), size: random(1, 2.5), alpha: random(50, 200), speed: random(0.1, 0.5)});
  for (let i = 0; i < 15; i++) bgHearts.push({x: random(width), y: random(height), scale: random(3.0, 6.0), angle: random(TWO_PI), rotSpeed: random(-0.005, 0.005), vx: random(-0.3, 0.3), vy: random(-0.3, 0.3)});

  document.querySelectorAll('.color-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      document.querySelectorAll('.color-btn').forEach(b => b.classList.remove('active'));
      e.target.classList.add('active');
      currentTheme = e.target.getAttribute('data-theme');
      updateThemeColors(currentTheme);
    });
  });

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 960, height: 640 }, audio: false });
    video = createVideo();
    video.elt.srcObject = stream;
    video.elt.play();
    video.size(width, height);
    video.hide();
    await new Promise((resolve) => {
      if (video.elt.readyState >= 2) resolve();
      else video.elt.onloadeddata = () => resolve(); 
    });
    handPose.detectStart(video, gotHands);
    isModelReady = true;
  } catch (err) { console.error("Init Failed:", err); }
}

function updateThemeColors(themeName) {
  targetMainColor = color(...themeColors[themeName].main);
  targetDarkColor = color(...themeColors[themeName].dark);
  targetGlowColor = color(...themeColors[themeName].glow);
  let centerTextH2 = document.querySelector('#center-text h2');
  if (centerTextH2) centerTextH2.style.color = themeColors[themeName].text;
}

function gotHands(results) { hands = results; }

function draw() {
  background(6, 10, 13); 
  
  if (!currentMainColor) {
    currentMainColor = targetMainColor;
    currentDarkColor = targetDarkColor;
    currentGlowColor = targetGlowColor;
  } else {
    currentMainColor = lerpColor(currentMainColor, targetMainColor, 0.1);
    currentDarkColor = lerpColor(currentDarkColor, targetDarkColor, 0.1);
    currentGlowColor = lerpColor(currentGlowColor, targetGlowColor, 0.1);
  }

  drawStars();
  drawBgHearts(); 

  if (!isModelReady) return;

  // --- 手势检测 ---
  isPinching = false;
  if (hands.length > 0) {
    let kp = hands[0].keypoints;
    if (kp[4] && kp[8] && isFinite(kp[4].x) && isFinite(kp[8].x)) {
      let d = dist(kp[4].x, kp[4].y, kp[8].x, kp[8].y);
      if (d < PINCH_THRESHOLD) {
        isPinching = true;
        pinchX = (kp[4].x + kp[8].x) / 2;
        pinchY = (kp[4].y + kp[8].y) / 2;
      }
    }
  }

  if (isPinching && !lastPinching) { dragStartX = pinchX; dragStartY = pinchY; } 
  else if (!isPinching && lastPinching) {
    if (dist(dragStartX, dragStartY, pinchX, pinchY) > 60) { createSmallHeart(pinchX, pinchY); playPopSound(); }
  }
  lastPinching = isPinching; 

  // --- 物理更新 ---
  let currentArea = calculateArea();
  let areaDiff = targetArea - currentArea; 

  for (let i = 0; i < n; i++) {
    vX[i] += -offX[i] * SPRING;
    vY[i] += -offY[i] * SPRING;

    let angleCenter = atan2(baseY[i], baseX[i]);
    let pressureForce = constrain(areaDiff * 0.0015, -3.0, 3.0); 
    vX[i] += cos(angleCenter) * pressureForce;
    vY[i] += sin(angleCenter) * pressureForce;

    if (isPinching) {
      let bx = cx + baseX[i] + offX[i];
      let by = cy + baseY[i] + offY[i];
      let dToPinch = dist(pinchX, pinchY, bx, by);
      if (dToPinch < INFLUENCE_RADIUS) {
        let normDist = dToPinch / INFLUENCE_RADIUS;
        let force = 15 * (1 - normDist) * (1 - normDist); 
        let angleToVertex = atan2(by - pinchY, bx - pinchX);
        vX[i] -= cos(angleToVertex) * force;
        vY[i] -= sin(angleToVertex) * force;
      }
    }

    vX[i] *= DAMPING; vY[i] *= DAMPING;
    vX[i] = constrain(vX[i], -20, 20); vY[i] = constrain(vY[i], -20, 20);
    offX[i] += vX[i]; offY[i] += vY[i];
  }

  // ==========================================
  // 绘制（已删除所有高光点）
  // ==========================================
  let heartBeatScale = isPinching ? 1.0 : 1.0 + sin(frameCount * 0.05) * 0.03;

  push();
  translate(cx, cy); 
  scale(heartBeatScale);

  // 1. 外发光与主色
  push();
  drawingContext.shadowBlur = 50;
  drawingContext.shadowColor = color(currentGlowColor.levels[0], currentGlowColor.levels[1], currentGlowColor.levels[2], 255); 
  fill(currentMainColor.levels[0], currentMainColor.levels[1], currentMainColor.levels[2], 255);
  noStroke();
  drawHeartShape();
  pop();

  // 2. 立体渐变
  push();
  let grad = drawingContext.createRadialGradient(-20, -20, 10, 0, 0, baseScale * 20);
  grad.addColorStop(0, `rgba(255, 255, 255, 0.4)`); 
  grad.addColorStop(0.6, `rgba(${currentMainColor.levels[0]},${currentMainColor.levels[1]},${currentMainColor.levels[2]}, 0)`); 
  grad.addColorStop(1, `rgba(${currentDarkColor.levels[0]},${currentDarkColor.levels[1]},${currentDarkColor.levels[2]}, 0.8)`); 
  
  drawingContext.fillStyle = grad;
  drawHeartShape();
  pop();

  // --- 【高光部分已被彻底删除】 ---

  pop(); // 结束缩放

  drawSmallHearts();

  // ==========================================
  // 声音
  // ==========================================
  if (audioReady && isPinching) {
    if (millis() - lastBeatTime > 350) { 
      heartOsc.freq(120); 
      heartOsc.amp(0.5, 0.02); 
      heartOsc.amp(0, 0.2);    
      lastBeatTime = millis();
    }
  }
}

function calculateArea() {
  let area = 0;
  for (let i = 0; i < n; i++) {
    let x1 = cx + baseX[i] + offX[i], y1 = cy + baseY[i] + offY[i];
    let x2 = cx + baseX[(i + 1) % n] + offX[(i + 1) % n], y2 = cy + baseY[(i + 1) % n] + offY[(i + 1) % n];
    area += (x1 * y2 - x2 * y1);
  }
  return abs(area) * 0.5;
}

function drawHeartShape() {
  beginShape();
  for (let i = 0; i < n; i++) curveVertex(baseX[i] + offX[i], baseY[i] + offY[i]);
  curveVertex(baseX[0] + offX[0], baseY[0] + offY[0]);
  curveVertex(baseX[1] + offX[1], baseY[1] + offY[1]);
  endShape(CLOSE);
}

function drawStars() {
  noStroke();
  for (let s of stars) {
    fill(255, s.alpha); circle(s.x, s.y, s.size);
    s.x -= s.speed * 0.5; s.y += s.speed;
    if (s.x < 0 || s.y > height) { s.x = random(width); s.y = 0; }
  }
}

function drawBgHearts() {
  push(); noStroke();
  fill(currentMainColor.levels[0], currentMainColor.levels[1], currentMainColor.levels[2], 30); 
  for (let h of bgHearts) {
    push(); translate(h.x, h.y); rotate(h.angle); scale(h.scale);
    beginShape();
    for (let j = 0; j < n; j++) curveVertex(bgX[j], bgY[j]); 
    endShape(CLOSE); pop();
    h.x += h.vx; h.y += h.vy; h.angle += h.rotSpeed;
    if (h.x < -300) h.x = width + 300; if (h.x > width + 300) h.x = -300;
    if (h.y < -300) h.y = height + 300; if (h.y > height + 300) h.y = -300;
  }
  pop();
}

function createSmallHeart(x, y) {
  smallHearts.push({ x: x, y: y, vx: random(-1, 1), vy: random(-3, -1), scale: random(0.5, 3.5), angle: random(TWO_PI), rotSpeed: random(-0.05, 0.05), alpha: 255 });
}

function drawSmallHearts() {
  for (let i = smallHearts.length - 1; i >= 0; i--) {
    let h = smallHearts[i];
    h.x += h.vx; h.y += h.vy; h.angle += h.rotSpeed; h.alpha -= 2; 

    push(); translate(h.x, h.y); rotate(h.angle); scale(h.scale);
    
    drawingContext.shadowBlur = 20;
    drawingContext.shadowColor = color(currentGlowColor.levels[0], currentGlowColor.levels[1], currentGlowColor.levels[2], h.alpha / 255);
    fill(currentMainColor.levels[0], currentMainColor.levels[1], currentMainColor.levels[2], h.alpha);
    noStroke();
    
    beginShape();
    for (let j = 0; j < n; j++) curveVertex(smX[j], smY[j]); 
    endShape(CLOSE);
    
    // --- 【小爱心的高光部分也已被彻底删除】 ---

    pop();

    if (h.alpha <= 0 || h.y < -200 || h.y > height + 200) smallHearts.splice(i, 1);
  }
}

function playPopSound() {
  if (!audioReady || !popOsc) return;
  try {
    popOsc.freq(300); 
    popOsc.amp(0.4, 0.01); 
    popOsc.freq(80, 0.2); 
    popOsc.amp(0, 0.2);    
  } catch (e) {}
}

function mousePressed() {
  let overlay = document.getElementById('overlay');
  if (overlay && !overlay.classList.contains('hidden')) {
    overlay.classList.add('hidden');
    document.getElementById('center-text').style.opacity = '0';
    userStartAudio();
    
    if (!audioReady) {
      heartOsc = new p5.Oscillator('sine');
      heartOsc.freq(120);
      heartOsc.amp(0); 
      heartOsc.start();
      
      popOsc = new p5.Oscillator('sine');
      popOsc.freq(300);
      popOsc.amp(0);
      popOsc.start();
      
      audioReady = true;
    }
  }
}