const startButton = document.getElementById("startButton");
const hero = document.getElementById("hero");
const gameSection = document.getElementById("gameSection");
const tokenStatus = document.getElementById("tokenStatus");
const playerNameEl = document.getElementById("playerName");
const seasonValueEl = document.getElementById("seasonValue");
const greenValueEl = document.getElementById("greenValue");
const yellowValueEl = document.getElementById("yellowValue");
const scoreValueEl = document.getElementById("scoreValue");
const livesValueEl = document.getElementById("livesValue");
const speedValueEl = document.getElementById("speedValue");
const overlay = document.getElementById("overlay");
const overlayTitle = document.getElementById("overlayTitle");
const overlayScore = document.getElementById("overlayScore");
const overlayCountdown = document.getElementById("overlayCountdown");
const restartButton = document.getElementById("restartButton");
const submitStatus = document.getElementById("submitStatus");
const brickGreenCount = document.getElementById("brickGreenCount");
const brickYellowCount = document.getElementById("brickYellowCount");
const canvas = document.getElementById("gameCanvas");
const canvasShell = document.querySelector(".canvas-shell");
const ctx = canvas.getContext("2d");

const urlParams = new URLSearchParams(window.location.search);
const token = urlParams.get("token") || urlParams.get("jwt");
const apiParam = urlParams.get("api");

let apiEndpoint = apiParam || "http://localhost:8080/game-score";
if (!apiEndpoint.endsWith("/game-score")) {
  apiEndpoint = apiEndpoint.replace(/\/$/, "") + "/game-score";
}

const state = {
  status: "IDLE",
  score: 0,
  lives: 3,
  speed: "Normal",
  submitted: false,
};

let countdownTimer = null;

let loopStarted = false;

const playerData = {
  user: null,
  green: 0,
  yellow: 0,
  season: null,
  exp: null,
};

const controls = {
  left: false,
  right: false,
};

const game = {
  canvasWidth: 900,
  canvasHeight: 560,
  paddle: { x: 0, width: 120, height: 14 },
  ball: { x: 0, y: 0, dx: 0, dy: 0, radius: 8 },
  bricks: [],
  brickCols: 10,
  brickRows: 0,
  brickWidth: 0,
  brickHeight: 0,
  brickPadding: 8,
  brickOffsetTop: 40,
  brickOffsetLeft: 24,
  normalSpeed: 5,
  fastSpeed: 8,
};

const colors = {
  green: "#6aaa64",
  yellow: "#c9b458",
  ball: "#fdfbf3",
  paddle: "#e0dcd1",
};

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

function decodeJwtPayload(jwtToken) {
  if (!jwtToken) throw new Error("Missing token");
  const parts = jwtToken.split(".");
  if (parts.length < 2) throw new Error("Invalid token");
  const base = parts[1].replace(/-/g, "+").replace(/_/g, "/");
  const padded = base.padEnd(base.length + ((4 - (base.length % 4)) % 4), "=");
  const json = atob(padded);
  return JSON.parse(json);
}

function loadPlayerData() {
  try {
    const payload = decodeJwtPayload(token);
    playerData.user = payload.user;
    playerData.green = Number(payload.green) || 0;
    playerData.yellow = Number(payload.yellow) || 0;
    playerData.season = payload.season;
    playerData.exp = payload.exp;

    if (!playerData.user || playerData.season === null) {
      throw new Error("Missing player data");
    }

    const now = Math.floor(Date.now() / 1000);
    if (playerData.exp && now > playerData.exp) {
      tokenStatus.textContent = "This link expired. Ask for a fresh one today.";
      startButton.disabled = true;
      startButton.classList.add("hidden");
      return false;
    }

    playerNameEl.textContent = playerData.user;
    seasonValueEl.textContent = playerData.season;
    greenValueEl.textContent = playerData.green;
    yellowValueEl.textContent = playerData.yellow;
    brickGreenCount.textContent = playerData.green;
    brickYellowCount.textContent = playerData.yellow;
    tokenStatus.textContent = "Token loaded. Ready to play.";
    return true;
  } catch (error) {
    tokenStatus.textContent = "Missing or invalid token in the URL.";
    startButton.disabled = true;
    startButton.classList.add("hidden");
    return false;
  }
}

function setupCanvas() {
  const shellStyle = getComputedStyle(canvasShell);
  const paddingX =
    parseFloat(shellStyle.paddingLeft || "0") +
    parseFloat(shellStyle.paddingRight || "0");
  const rawWidth = canvasShell.clientWidth - paddingX;
  const cssWidth = clamp(rawWidth, 320, 1400);
  const cssHeight = Math.max(520, Math.round(cssWidth * 0.68));
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.floor(cssWidth * dpr);
  canvas.height = Math.floor(cssHeight * dpr);
  canvas.style.width = `${cssWidth}px`;
  canvas.style.height = `${cssHeight}px`;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  game.canvasWidth = cssWidth;
  game.canvasHeight = cssHeight;
  game.paddle.width = clamp(cssWidth * 0.18, 90, 160);
  game.paddle.height = 14;
  game.ball.radius = clamp(cssWidth * 0.012, 6, 10);
  game.normalSpeed = clamp(cssWidth * 0.006, 4.5, 6);
  game.fastSpeed = clamp(cssWidth * 0.009, 7, 9);
}

function shuffle(array) {
  for (let i = array.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
}

function buildBricks() {
  const totalBricks = playerData.green + playerData.yellow;
  if (totalBricks <= 0) {
    tokenStatus.textContent = "No bricks to build. Check your token values.";
    return false;
  }

  let cols = 10;
  const padding = 8;
  const sidePadding = 24;
  const minWidth = 28;
  let brickWidth = (game.canvasWidth - sidePadding * 2 - padding * (cols - 1)) / cols;
  while (brickWidth < minWidth && cols > 6) {
    cols -= 1;
    brickWidth = (game.canvasWidth - sidePadding * 2 - padding * (cols - 1)) / cols;
  }

  const brickAreaBottom = game.canvasHeight - 120;
  const maxArea = Math.min(game.canvasHeight * 0.45, brickAreaBottom - game.brickOffsetTop);
  const minHeight = 14;
  const maxRows = Math.max(
    1,
    Math.floor((maxArea + padding) / (minHeight + padding))
  );
  let rows = Math.ceil(totalBricks / cols);
  let scaledGreen = playerData.green;
  let scaledYellow = playerData.yellow;
  const capacity = maxRows * cols;
  if (rows > maxRows) {
    rows = maxRows;
    const scale = capacity / totalBricks;
    scaledGreen = Math.max(0, Math.round(playerData.green * scale));
    scaledYellow = Math.max(0, capacity - scaledGreen);
    tokenStatus.textContent =
      "Brick totals scaled to fit the board while keeping your ratio.";
  }

  let brickHeight = (maxArea - padding * (rows - 1)) / rows;
  brickHeight = clamp(brickHeight, minHeight, 22);

  game.brickCols = cols;
  game.brickRows = rows;
  game.brickWidth = brickWidth;
  game.brickHeight = brickHeight;
  game.brickPadding = padding;
  game.brickOffsetLeft = sidePadding;
  game.brickOffsetTop = 40;

  const colorsPool = [];
  for (let i = 0; i < scaledGreen; i += 1) colorsPool.push("green");
  for (let i = 0; i < scaledYellow; i += 1) colorsPool.push("yellow");
  shuffle(colorsPool);

  brickGreenCount.textContent = scaledGreen;
  brickYellowCount.textContent = scaledYellow;

  const bricks = [];
  let colorIndex = 0;
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      if (colorIndex >= colorsPool.length) break;
      const x =
        col * (brickWidth + padding) + game.brickOffsetLeft;
      const y =
        row * (brickHeight + padding) + game.brickOffsetTop;
      bricks.push({
        x,
        y,
        width: brickWidth,
        height: brickHeight,
        active: true,
        color: colorsPool[colorIndex],
        points: (rows - row) * 10,
      });
      colorIndex += 1;
    }
  }
  game.bricks = bricks;
  return true;
}

function resetBallAndPaddle() {
  game.paddle.x = (game.canvasWidth - game.paddle.width) / 2;
  game.ball.x = game.canvasWidth / 2;
  game.ball.y = game.canvasHeight - 40;
  game.ball.dx = game.normalSpeed * (Math.random() > 0.5 ? 1 : -1);
  game.ball.dy = -game.normalSpeed;
  setSpeed("Normal");
}

function setSpeed(speedLabel) {
  state.speed = speedLabel;
  speedValueEl.textContent = speedLabel;
}

function updateScore(points, brickColor) {
  const multiplier = brickColor === "green" ? 2 : 1;
  state.score += points * multiplier;
  scoreValueEl.textContent = String(state.score).padStart(6, "0");
}

function handleLifeLost() {
  state.lives -= 1;
  livesValueEl.textContent = state.lives;
  if (state.lives <= 0) {
    endGame("Game over", false);
  } else {
    showLifeLostCountdown();
  }
}

function showLifeLostCountdown() {
  state.status = "PAUSED";
  overlayTitle.textContent = "Life lost";
  overlayScore.textContent = `Score: ${state.score}`;
  overlayCountdown.classList.remove("hidden");
  restartButton.classList.add("hidden");
  overlay.classList.remove("hidden");

  let remaining = 3;
  overlayCountdown.textContent = String(remaining);

  if (countdownTimer) {
    clearInterval(countdownTimer);
  }

  countdownTimer = setInterval(() => {
    remaining -= 1;
    overlayCountdown.textContent = String(remaining);
    if (remaining <= 0) {
      clearInterval(countdownTimer);
      countdownTimer = null;
      overlay.classList.add("hidden");
      overlayCountdown.classList.add("hidden");
      restartButton.classList.remove("hidden");
      resetBallAndPaddle();
      state.status = "PLAYING";
    }
  }, 1000);
}

function endGame(title, won) {
  state.status = "ENDED";
  overlayTitle.textContent = title;
  overlayScore.textContent = `Score: ${state.score}`;
  overlayCountdown.classList.add("hidden");
  restartButton.classList.remove("hidden");
  overlay.classList.remove("hidden");
  submitStatus.textContent = "Submitting...";
  submitScore().then((message) => {
    submitStatus.textContent = message;
  });
}

async function submitScore() {
  if (state.submitted) return "Score already submitted";
  state.submitted = true;
  try {
    const response = await fetch(apiEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, score: state.score }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      return data.details ? `Failed: ${data.details}` : "Submission failed";
    }
    return data.discord_posted ? "Score submitted and posted!" : "Score submitted.";
  } catch (error) {
    return "Submission failed: network error";
  }
}

function drawBricks() {
  game.bricks.forEach((brick) => {
    if (!brick.active) return;
    ctx.beginPath();
    ctx.rect(brick.x, brick.y, brick.width, brick.height);
    ctx.fillStyle = brick.color === "green" ? colors.green : colors.yellow;
    ctx.fill();
    ctx.closePath();
  });
}

function drawBall() {
  ctx.beginPath();
  ctx.arc(game.ball.x, game.ball.y, game.ball.radius, 0, Math.PI * 2);
  ctx.fillStyle = colors.ball;
  ctx.fill();
  ctx.closePath();
}

function drawPaddle() {
  ctx.beginPath();
  ctx.rect(
    game.paddle.x,
    game.canvasHeight - game.paddle.height - 10,
    game.paddle.width,
    game.paddle.height
  );
  ctx.fillStyle = colors.paddle;
  ctx.fill();
  ctx.closePath();
}

function update() {
  if (state.status !== "PLAYING") return;

  const ball = game.ball;
  const paddle = game.paddle;

  if (ball.x + ball.dx > game.canvasWidth - ball.radius || ball.x + ball.dx < ball.radius) {
    ball.dx = -ball.dx;
  }
  if (ball.y + ball.dy < ball.radius) {
    ball.dy = -ball.dy;
  } else if (ball.y + ball.dy > game.canvasHeight - ball.radius - 10) {
    if (ball.x > paddle.x && ball.x < paddle.x + paddle.width) {
      const hitPos = (ball.x - (paddle.x + paddle.width / 2)) / (paddle.width / 2);
      ball.dy = -Math.abs(ball.dy);
      const currentSpeed = Math.sqrt(ball.dx * ball.dx + ball.dy * ball.dy);
      ball.dx = hitPos * currentSpeed * 0.9;
    } else if (ball.y + ball.dy > game.canvasHeight) {
      handleLifeLost();
      return;
    }
  }

  game.bricks.forEach((brick) => {
    if (!brick.active) return;
    if (
      ball.x > brick.x &&
      ball.x < brick.x + brick.width &&
      ball.y > brick.y &&
      ball.y < brick.y + brick.height
    ) {
      ball.dy = -ball.dy;
      brick.active = false;
      const newSpeed = brick.color === "green" ? game.normalSpeed : game.fastSpeed;
      const angle = Math.atan2(ball.dy, ball.dx);
      ball.dx = Math.cos(angle) * newSpeed;
      ball.dy = Math.sin(angle) * newSpeed;
      setSpeed(brick.color === "green" ? "Normal" : "Fast");
      updateScore(brick.points, brick.color);
    }
  });

  if (game.bricks.every((brick) => !brick.active)) {
    endGame("You cleared the wall!", true);
    return;
  }

  if (controls.right && paddle.x < game.canvasWidth - paddle.width) {
    paddle.x += 7;
  } else if (controls.left && paddle.x > 0) {
    paddle.x -= 7;
  }

  ball.x += ball.dx;
  ball.y += ball.dy;
}

function draw() {
  ctx.clearRect(0, 0, game.canvasWidth, game.canvasHeight);
  drawBricks();
  drawBall();
  drawPaddle();
}

function loop() {
  update();
  draw();
  requestAnimationFrame(loop);
}

function startGame() {
  hero.classList.add("hidden");
  gameSection.classList.remove("hidden");
  requestAnimationFrame(() => {
    setupCanvas();
    if (!buildBricks()) return;
    state.status = "PLAYING";
    state.score = 0;
    state.lives = 3;
    state.submitted = false;
    scoreValueEl.textContent = "000000";
    livesValueEl.textContent = state.lives;
    overlay.classList.add("hidden");
    submitStatus.textContent = "Waiting";
    resetBallAndPaddle();
  });
}

function restartGame() {
  state.status = "PLAYING";
  state.score = 0;
  state.lives = 3;
  state.submitted = false;
  if (countdownTimer) {
    clearInterval(countdownTimer);
    countdownTimer = null;
  }
  scoreValueEl.textContent = "000000";
  livesValueEl.textContent = state.lives;
  overlay.classList.add("hidden");
  overlayCountdown.classList.add("hidden");
  submitStatus.textContent = "Waiting";
  buildBricks();
  resetBallAndPaddle();
}

function handlePointerMove(event) {
  if (state.status !== "PLAYING") return;
  if (event.touches) {
    event.preventDefault();
  }
  const rect = canvas.getBoundingClientRect();
  const clientX = event.touches ? event.touches[0].clientX : event.clientX;
  const scale = rect.width / game.canvasWidth;
  const relativeX = (clientX - rect.left) / scale;
  game.paddle.x = clamp(relativeX - game.paddle.width / 2, 0, game.canvasWidth - game.paddle.width);
}

startButton.addEventListener("click", () => {
  startGame();
  if (!loopStarted) {
    loopStarted = true;
    requestAnimationFrame(loop);
  }
});

restartButton.addEventListener("click", restartGame);

window.addEventListener("resize", () => {
  if (state.status === "PLAYING" || state.status === "ENDED") {
    setupCanvas();
    buildBricks();
    resetBallAndPaddle();
  }
});

window.addEventListener("mousemove", handlePointerMove);
window.addEventListener("touchmove", handlePointerMove, { passive: false });
window.addEventListener("keydown", (event) => {
  if (event.key === "ArrowLeft") controls.left = true;
  if (event.key === "ArrowRight") controls.right = true;
});
window.addEventListener("keyup", (event) => {
  if (event.key === "ArrowLeft") controls.left = false;
  if (event.key === "ArrowRight") controls.right = false;
});

loadPlayerData();
