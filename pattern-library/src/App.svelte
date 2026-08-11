<script>
import CardList from "./Cards.svelte";
	import Card from "./lib/components/CardProxy.svelte";
	import ShuffleText from "./lib/components/ShuffleText.svelte";
	import ShuffleCode from "./lib/components/ShuffleCode.svelte";
	import { CHAR_POOL } from "./lib/shuffle.js";

	let cardCode;

	// 由卡片 id 确定性生成三位字母码（同一张卡永远同一个码）
	function threeLetterCode(id) {
		let h = 2166136261;
		for (const ch of id) {
			h ^= ch.charCodeAt(0);
			h = Math.imul(h, 16777619);
		}
		h = h >>> 0;
		let s = "";
		for (let i = 0; i < 3; i++) {
			s += CHAR_POOL[(h >>> (i * 8)) % 26];
		}
		return s;
	}

	function onCardHover(e) {
		if (cardCode) cardCode.startShuffle(threeLetterCode(e.detail));
	}

	function onCardLeave() {
		if (cardCode) cardCode.resetShuffle();
	}

	// 通知父页面（拼豆游戏）关闭图纸库 iframe，返回画布；
	// 若直接打开图纸库页面（未嵌入 iframe），则跳到上级目录（拼豆主界面）
	function backToGame() {
		if (window.parent !== window) {
			window.parent.postMessage({ type: "bead-close-cards" }, "*");
		} else {
			window.location.href = "../";
		}
	}
</script>

<svelte:window on:card-hover={onCardHover} on:card-leave={onCardLeave} />

<main>

		<div class="ship-section__head">
			<h2 class="ship-section__title">
				<span class="ship-section__title-row">
					<span>Patterns</span>
					<ShuffleCode bind:this={cardCode} />
				</span>
			</h2>
			<p class="ship-section__meta">
				<ShuffleText text="Welcome to submit · " />
				<button class="ship-section__back" on:click={backToGame}>Click patterns to return</button>
			</p>
		</div>

		<CardList>
			<Card
				id="pattern-01"
				name="Rainbow Alt (p01)"
				types="pattern"
				img="./patterns/p01.webp"
				number="01"
				rarity="Rare Rainbow Alt"
				supertype="Pokémon"
				subtypes="Basic"
			/>
			<Card
				id="pattern-02"
				name="Radiant (p02)"
				types="pattern"
				img="./patterns/p02.webp"
				number="02"
				rarity="Radiant Rare"
				supertype="Pokémon"
				subtypes="Basic"
			/>
			<Card
				id="pattern-03"
				name="Reverse Holo (p03)"
				types="pattern"
				img="./patterns/p03.webp"
				number="03"
				rarity="Common"
				isReverse
				supertype="Pokémon"
				subtypes="Basic"
			/>
			<Card
				id="pattern-04"
				name="Pikachu Promo (p04)"
				types="pattern"
				img="./patterns/p04.webp"
				number="160"
				rarity="Rare Secret"
				set="swsh12pt5"
				supertype="Pokémon"
				subtypes="Basic"
				foil={false}
				mask={false}
			/>
			<Card
				id="pattern-05"
				name="Cosmos (p05)"
				types="pattern"
				img="./patterns/p05.webp"
				number="05"
				rarity="Rare Holo Cosmos"
				supertype="Pokémon"
				subtypes="Basic"
			/>
			<Card
				id="pattern-06"
				name="TG V (p06)"
				types="pattern"
				img="./patterns/p06.webp"
				number="tg02"
				rarity="Rare Holo V"
				supertype="Pokémon"
				subtypes="Basic"
			/>
			<Card
				id="pattern-07"
				name="TG Gold (p07)"
				types="pattern"
				img="./patterns/p07.webp"
				number="tg04"
				rarity="Rare Secret"
				supertype="Pokémon"
				subtypes="Basic"
			/>
			<Card
				id="pattern-08"
				name="Shiny V (p08)"
				types="pattern"
				img="./patterns/p08.webp"
				number="sv02"
				rarity="Rare Shiny V"
				supertype="Pokémon"
				subtypes="Basic"
			/>
			<Card
				id="pattern-09"
				name="Regular Holo (p09)"
				types="pattern"
				img="./patterns/p09.webp"
				number="09"
				rarity="Rare Holo"
				supertype="Pokémon"
				subtypes="Basic"
			/>
			<Card
				id="pattern-10"
				name="Plain (No Foil) (p10)"
				types="pattern"
				img="./patterns/p10.webp"
				number="10"
				supertype="Pokémon"
				subtypes="Basic"
			/>
			<Card
				id="pattern-11"
				name="Shiny VMAX (p11)"
				types="pattern"
				img="./patterns/p11.webp"
				number="sv03"
				rarity="Rare Shiny VMAX"
				supertype="Pokémon"
				subtypes="Basic"
			/>
			<Card
				id="pattern-12"
				name="Ultra Full Art (p12)"
				types="pattern"
				img="./patterns/p12.webp"
				number="12"
				rarity="Rare Ultra"
				supertype="Pokémon"
				subtypes="Basic"
			/>
			<Card
				id="pattern-13"
				name="Amazing Rare (p13)"
				types="pattern"
				img="./patterns/p13.webp"
				number="13"
				rarity="Amazing Rare"
				supertype="Pokémon"
				subtypes="Basic"
			/>
			<Card
				id="pattern-14"
				name="Gold Secret (p14)"
				types="pattern"
				img="./patterns/p14.webp"
				number="14"
				rarity="Rare Secret"
				supertype="Pokémon"
				subtypes="Basic"
			/>
			<Card
				id="pattern-15"
				name="Trainer Full Art (p15)"
				types="pattern"
				img="./patterns/p15.webp"
				number="15"
				rarity="Rare Ultra"
				supertype="Pokémon"
				subtypes="Supporter"
			/>
			<Card
				id="pattern-16"
				name="VMAX (p16)"
				types="pattern"
				img="./patterns/p16.webp"
				number="16"
				rarity="Rare Holo VMAX"
				supertype="Pokémon"
				subtypes="Basic"
			/>
			<Card
				id="pattern-17"
				name="TG VMAX (p17)"
				types="pattern"
				img="./patterns/p17.webp"
				number="tg03"
				rarity="Rare Holo VMAX"
				supertype="Pokémon"
				subtypes="Basic"
			/>
			<Card
				id="pattern-18"
				name="Rainbow (p18)"
				types="pattern"
				img="./patterns/p18.webp"
				number="18"
				rarity="Rare Rainbow"
				supertype="Pokémon"
				subtypes="Basic"
			/>
			<Card
				id="pattern-19"
				name="VSTAR (p19)"
				types="pattern"
				img="./patterns/p19.webp"
				number="19"
				rarity="Rare Holo VSTAR"
				supertype="Pokémon"
				subtypes="Basic"
			/>
			<Card
				id="pattern-20"
				name="Sunpillar V (p20)"
				types="pattern"
				img="./patterns/p20.webp"
				number="20"
				rarity="Rare Holo V"
				supertype="Pokémon"
				subtypes="Basic"
			/>
			<Card
				id="pattern-21"
				name="TG Holo (p21)"
				types="pattern"
				img="./patterns/p21.webp"
				number="tg01"
				rarity="Rare Holo"
				supertype="Pokémon"
				subtypes="Basic"
			/>
			<Card
				id="pattern-22"
				name="Shiny (p22)"
				types="pattern"
				img="./patterns/p22.webp"
				number="sv01"
				rarity="Rare Shiny"
				supertype="Pokémon"
				subtypes="Basic"
			/>
			<Card
				id="pattern-23"
				name="Pikachu Promo (p23)"
				types="pattern"
				img="./patterns/p23.webp"
				number="160"
				rarity="Rare Secret"
				set="swsh12pt5"
				supertype="Pokémon"
				subtypes="Basic"
				foil={false}
				mask={false}
			/>
			<Card
				id="pattern-24"
				name="VSTAR (p24)"
				types="pattern"
				img="./patterns/p24.webp"
				number="24"
				rarity="Rare Holo VSTAR"
				supertype="Pokémon"
				subtypes="Basic"
			/>
			<Card
				id="pattern-25"
				name="Cosmos (p25)"
				types="pattern"
				img="./patterns/p25.webp"
				number="25"
				rarity="Rare Holo Cosmos"
				supertype="Pokémon"
				subtypes="Basic"
			/>
			<Card
				id="pattern-26"
				name="Gold Secret (p26)"
				types="pattern"
				img="./patterns/p26.webp"
				number="26"
				rarity="Rare Secret"
				supertype="Pokémon"
				subtypes="Basic"
			/>
			<Card
				id="pattern-27"
				name="TG VMAX (p27)"
				types="pattern"
				img="./patterns/p27.webp"
				number="tg03"
				rarity="Rare Holo VMAX"
				supertype="Pokémon"
				subtypes="Basic"
			/>
			<Card
				id="pattern-28"
				name="Amazing Rare (p28)"
				types="pattern"
				img="./patterns/p28.webp"
				number="28"
				rarity="Amazing Rare"
				supertype="Pokémon"
				subtypes="Basic"
			/>
			<Card
				id="pattern-29"
				name="Cosmos (p29)"
				types="pattern"
				img="./patterns/p29.webp"
				number="29"
				rarity="Rare Holo Cosmos"
				supertype="Pokémon"
				subtypes="Basic"
			/>
			<Card
				id="pattern-30"
				name="VSTAR (p30)"
				types="pattern"
				img="./patterns/p30.webp"
				number="30"
				rarity="Rare Holo VSTAR"
				supertype="Pokémon"
				subtypes="Basic"
			/>
			<Card
				id="pattern-31"
				name="VSTAR (p31)"
				types="pattern"
				img="./patterns/p31.webp"
				number="31"
				rarity="Rare Holo VSTAR"
				supertype="Pokémon"
				subtypes="Basic"
			/>
			<Card
				id="pattern-32"
				name="Ultra Full Art (p32)"
				types="pattern"
				img="./patterns/p32.webp"
				number="32"
				rarity="Rare Ultra"
				supertype="Pokémon"
				subtypes="Basic"
			/>
			<Card
				id="pattern-33"
				name="Pikachu Promo (p33)"
				types="pattern"
				img="./patterns/p33.webp"
				number="160"
				rarity="Rare Secret"
				set="swsh12pt5"
				supertype="Pokémon"
				subtypes="Basic"
				foil={false}
				mask={false}
			/>
			<Card
				id="pattern-34"
				name="Ultra Full Art (p34)"
				types="pattern"
				img="./patterns/p34.webp"
				number="34"
				rarity="Rare Ultra"
				supertype="Pokémon"
				subtypes="Basic"
			/>
			<Card
				id="pattern-35"
				name="Regular Holo (p35)"
				types="pattern"
				img="./patterns/p35.webp"
				number="35"
				rarity="Rare Holo"
				supertype="Pokémon"
				subtypes="Basic"
			/>
			<Card
				id="pattern-36"
				name="Rainbow Alt (p36)"
				types="pattern"
				img="./patterns/p36.webp"
				number="36"
				rarity="Rare Rainbow Alt"
				supertype="Pokémon"
				subtypes="Basic"
			/>
			<Card
				id="pattern-37"
				name="Plain (No Foil) (p37)"
				types="pattern"
				img="./patterns/p37.webp"
				number="37"
				supertype="Pokémon"
				subtypes="Basic"
			/>
			<Card
				id="pattern-38"
				name="Amazing Rare (p38)"
				types="pattern"
				img="./patterns/p38.webp"
				number="38"
				rarity="Amazing Rare"
				supertype="Pokémon"
				subtypes="Basic"
			/>
		</CardList>
	</main>
