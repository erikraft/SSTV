import "./audio-player.css";

const formatTime = (seconds) => {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const minutes = Math.floor(seconds / 60);
  const remaining = Math.floor(seconds % 60).toString().padStart(2, "0");
  return `${minutes}:${remaining}`;
};

const createButton = (label, text) => {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "sstv-audio-player__button";
  button.setAttribute("aria-label", label);
  button.textContent = text;
  return button;
};

function initPlayer(player) {
  const audio = player.querySelector("audio");
  if (!audio) return;

  audio.className = "sstv-audio-player__audio";
  audio.controls = false;

  const controls = document.createElement("div");
  controls.className = "sstv-audio-player__controls";

  const playButton = createButton("Play audio", "Play");
  const main = document.createElement("div");
  main.className = "sstv-audio-player__main";
  const seek = document.createElement("input");
  seek.type = "range";
  seek.className = "sstv-audio-player__range";
  seek.min = "0";
  seek.max = "100";
  seek.value = "0";
  seek.setAttribute("aria-label", "Audio progress");
  const meta = document.createElement("div");
  meta.className = "sstv-audio-player__meta";
  const elapsed = document.createElement("span");
  const duration = document.createElement("span");
  elapsed.textContent = "0:00";
  duration.textContent = "0:00";
  meta.append(elapsed, duration);
  main.append(seek, meta);

  const volume = document.createElement("div");
  volume.className = "sstv-audio-player__volume";
  const muteButton = createButton("Mute audio", "Mute");
  const volumeRange = document.createElement("input");
  volumeRange.type = "range";
  volumeRange.className = "sstv-audio-player__range";
  volumeRange.min = "0";
  volumeRange.max = "1";
  volumeRange.step = "0.01";
  volumeRange.value = String(audio.volume);
  volumeRange.setAttribute("aria-label", "Audio volume");
  volume.append(muteButton, volumeRange);
  controls.append(playButton, main, volume);
  player.append(controls);

  const syncPlayState = () => {
    const playing = !audio.paused && !audio.ended;
    playButton.textContent = playing ? "Pause" : "Play";
    playButton.setAttribute("aria-label", playing ? "Pause audio" : "Play audio");
  };
  const syncProgress = () => {
    const percent = audio.duration ? (audio.currentTime / audio.duration) * 100 : 0;
    seek.value = String(percent);
    elapsed.textContent = formatTime(audio.currentTime);
    duration.textContent = formatTime(audio.duration);
  };
  const syncMuteState = () => {
    muteButton.textContent = audio.muted ? "Unmute" : "Mute";
    muteButton.setAttribute("aria-label", audio.muted ? "Unmute audio" : "Mute audio");
  };

  playButton.addEventListener("click", () => {
    if (audio.paused) {
      void audio.play().catch(() => {});
    } else {
      audio.pause();
    }
  });
  muteButton.addEventListener("click", () => {
    audio.muted = !audio.muted;
    syncMuteState();
  });
  seek.addEventListener("input", () => {
    if (audio.duration) audio.currentTime = (Number(seek.value) / 100) * audio.duration;
  });
  volumeRange.addEventListener("input", () => {
    audio.volume = Number(volumeRange.value);
    audio.muted = audio.volume === 0;
    syncMuteState();
  });
  audio.addEventListener("play", syncPlayState);
  audio.addEventListener("pause", syncPlayState);
  audio.addEventListener("ended", syncPlayState);
  audio.addEventListener("timeupdate", syncProgress);
  audio.addEventListener("loadedmetadata", syncProgress);
  audio.addEventListener("volumechange", syncMuteState);

  const syncVisibility = () => {
    player.hidden = audio.hidden;
  };
  new MutationObserver(syncVisibility).observe(audio, {
    attributes: true,
    attributeFilter: ["hidden"],
  });
  syncVisibility();
  syncMuteState();
  syncProgress();
}

document.querySelectorAll("[data-audio-player]").forEach(initPlayer);
