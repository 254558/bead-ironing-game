<script>
  import { onDestroy } from 'svelte';
  import {
    CHAR_POOL,
    SHUFFLE_TEXT_FRAME_RATE,
    SHUFFLE_TEXT_DELAY_PER_CHAR,
    SHUFFLE_TEXT_DURATION,
  } from '../shuffle.js';

  /** 需要展示的文字 */
  export let text = '';

  let showChars = text.split('');
  let shuffleTimer = null;

  function startShuffle() {
    clearInterval(shuffleTimer);

    const originArr = text.split('');
    const len = originArr.length;
    showChars = [...originArr];

    let ticks = 0;

    shuffleTimer = setInterval(() => {
      let allFinished = true;

      showChars = originArr.map((ch, idx) => {
        const startFrame = idx * SHUFFLE_TEXT_DELAY_PER_CHAR;
        const endFrame = startFrame + SHUFFLE_TEXT_DURATION;

        if (ticks < startFrame) return ch;
        if (ticks < endFrame) {
          allFinished = false;
          return CHAR_POOL[Math.floor(Math.random() * CHAR_POOL.length)];
        }
        return ch;
      });

      ticks++;

      if (allFinished && ticks > len * SHUFFLE_TEXT_DELAY_PER_CHAR + SHUFFLE_TEXT_DURATION) {
        clearInterval(shuffleTimer);
      }
    }, SHUFFLE_TEXT_FRAME_RATE);
  }

  function resetShuffle() {
    clearInterval(shuffleTimer);
    showChars = text.split('');
  }

  onDestroy(() => clearInterval(shuffleTimer));
</script>

<span
  class="shuffle-text"
  on:mouseenter={startShuffle}
  on:mouseleave={resetShuffle}
>
  {#each showChars as ch, i (i)}{ch}{/each}
</span>

<style>
  .shuffle-text {
    display: inline-flex;
    cursor: pointer;
    white-space: nowrap;
    transition: color 0.3s ease;
  }

  .shuffle-text:hover {
    color: #fff;
  }
</style>
