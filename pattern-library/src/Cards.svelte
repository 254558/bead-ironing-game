<script>
		
		import { activeCard } from "./lib/stores/activeCard.js";
		import { fade } from "svelte/transition";
		
		let thisGrid;
		
		$: active = thisGrid && thisGrid.contains( $activeCard );
		
	</script>

	<section 
		class="card-grid" 
		class:active
		bind:this={thisGrid}
	>

		{#if active}
			<!-- 展开卡牌时压暗其他卡，让放大的卡和顶部 import 更醒目；
			     z-index 介于普通卡(≈2-8)与展开卡(interacting ≈scale*120)之间，
			     pointer-events none 不拦截点击（点其他卡可切换展开） -->
			<div class="grid-dim" transition:fade={{ duration: 250 }}></div>
		{/if}

	<slot />

	</section>

<style>
	.card-grid {
		display: grid;
		grid-template-columns: repeat(10, 1fr);
		grid-gap: 12px;
		height: 100%;
		max-width: none;
		margin: auto;
		padding: 16px 20px;
		position: relative;
	}
	
	.card-grid.active {
		z-index: 99;
		/* isolation: isolate; */
	}
	
	/* 窄屏降列，避免卡片过小：平板 6 列、手机 4 列 */
	@media screen and (max-width: 900px) {
		.card-grid {
			grid-template-columns: repeat(6, 1fr);
		}
	}
	
	@media screen and (max-width: 560px) {
		.card-grid {
			grid-template-columns: repeat(4, 1fr);
		}
	}

	:global( .card-grid > .card.active ) {
		transform: translate3d(0, 0, 0.1px)!important;
	}
	
	/* 展开时压暗背景的遮罩（grid 内，absolute 相对 .card-grid） */
	.grid-dim {
		position: absolute;
		inset: 0;
		z-index: 50;
		background: rgba(7, 9, 14, 0.62);
		pointer-events: none;
	}
	
</style>
