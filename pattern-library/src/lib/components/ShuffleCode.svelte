<script>
  import { onDestroy } from "svelte";
  import {
    CHAR_POOL,
    SHUFFLE_CODE_MAX_STEPS,
    SHUFFLE_CODE_STEP_INTERVAL,
  } from "../shuffle.js";

  /** 默认显示内容 */
  export let defaultText = "38";

  let targetText = defaultText;
  let displayText = defaultText;
  let shuffleTimer = null;

  function randomChars(len) {
    return Array.from({ length: len }, () =>
      CHAR_POOL[Math.floor(Math.random() * CHAR_POOL.length)]
    ).join("");
  }

  /** 整串随机洗牌 N 步后落定 */
  export function startShuffle(finalText) {
    targetText = finalText;
    let step = 0;
    clearInterval(shuffleTimer);

    shuffleTimer = setInterval(() => {
      if (step < SHUFFLE_CODE_MAX_STEPS) {
        displayText = randomChars(finalText.length);
        step++;
      } else {
        displayText = finalText;
        clearInterval(shuffleTimer);
      }
    }, SHUFFLE_CODE_STEP_INTERVAL);
  }

  export function resetShuffle() {
    clearInterval(shuffleTimer);
    targetText = defaultText;
    displayText = defaultText;
  }

  onDestroy(() => clearInterval(shuffleTimer));
</script>

<div class="shuffle-code">
  <span>{displayText}</span>
</div>

<style>
  .shuffle-code {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 0.35rem 0.6rem;
    border: 2px solid #fff;
    border-radius: 5px;
    font-family: "GeistMono", ui-monospace, monospace;
    font-size: 1.25rem;
    font-weight: 600;
    text-transform: uppercase;
    color: #fff;
    line-height: 1;
    cursor: pointer;
    white-space: nowrap;
  }
</style>
