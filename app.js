import { parseKeyValues, extractItems } from "./parser/cfg-parser.js";

const [weaponsData, bossesData, commandsData, changelogData, mapsData, mapImagesData] = await Promise.all([
  fetch("./data/weapons.json", { cache: "no-store" }).then(r => r.json()),
  fetch("./data/bosses.json", { cache: "no-store" }).then(r => r.json()),
  fetch("./data/commands.json", { cache: "no-store" }).then(r => r.json()),
  fetch("./data/changelog.json", { cache: "no-store" }).then(r => r.json()),
  fetch("./data/maps.json", { cache: "no-store" }).then(r => r.json()),
  fetch("./data/map-images.json", { cache: "no-store" })
    .then(r => r.ok ? r.json() : {})
    .catch(() => ({}))
]);

const weapons = Array.isArray(weaponsData) ? weaponsData : [weaponsData];
const bosses = {
  solo: Array.isArray(bossesData?.solo) ? bossesData.solo : [],
  duos: Array.isArray(bossesData?.duos) ? bossesData.duos : []
};
const commands = Array.isArray(commandsData) ? commandsData : [commandsData];
const changelog = Array.isArray(changelogData) ? changelogData : [changelogData];
const maps = Array.isArray(mapsData) ? mapsData : [];
const mapImages = mapImagesData && typeof mapImagesData === "object" && !Array.isArray(mapImagesData)
  ? mapImagesData
  : {};

const views = [...document.querySelectorAll(".view")];

function showView(id){
  views.forEach(v => v.classList.toggle("active", v.id === id));
  document.querySelectorAll(".nav-btn").forEach(
    b => b.classList.toggle("active", b.dataset.view === id)
  );
  window.scrollTo({ top: 0, behavior: "smooth" });
}

document.querySelectorAll("[data-view]").forEach(
  b => b.addEventListener("click", () => showView(b.dataset.view))
);
document.querySelectorAll("[data-view-link]").forEach(
  b => b.addEventListener("click", () => showView(b.dataset.viewLink))
);

let weaponSearchQuery = "";
let weaponClassFilter = "all";

function weaponRuleSearchText(rule){
  if(!rule) return "";

  const attrs = Object.keys(rule.attributes || {}).join(" ");
  const custom = Object.keys(rule.custom || {}).join(" ");
  const overrides = Object.entries(rule.classOverrides || {}).map(([className, value]) =>
    `${className} ${weaponRuleSearchText(value)}`
  ).join(" ");

  return `${rule.label || ""} ${rule.sourceKey || ""} ${attrs} ${custom} ${overrides}`;
}

function weaponMatchesClass(weapon, classFilter){
  if(classFilter === "all") return true;
  if(classFilter === "Multi-class"){
    return String(weapon.class || "").includes("/") || weapon.class === "Multi-class";
  }
  return String(weapon.class || "").split(" / ").includes(classFilter);
}

function renderWeapons(){
  const q = weaponSearchQuery.toLowerCase().trim();

  const list = weapons.filter(w => {
    const changeText = (w.ff2Changes || []).map(weaponRuleSearchText).join(" ");
    const text = `
      ${w.name || ""}
      ${w.classname || ""}
      ${w.class || ""}
      ${w.slot || ""}
      ${(w.defindexes || []).join(" ")}
      ${changeText}
    `.toLowerCase();

    return weaponMatchesClass(w, weaponClassFilter) && text.includes(q);
  });

  const counter = document.querySelector("#weapon-result-count");
  if(counter) counter.textContent = list.length;

  document.querySelector("#weapon-list").innerHTML = list.map(w => {
    const rules = w.ff2Changes || [];
    const itemRule = rules.find(rule => rule.source === "item");
    const classnameRule = rules.find(rule => rule.source === "classname");

    return `
      <article class="item-card weapon-card">
        ${w.image ? `<img class="item-img" src="${escapeAttr(w.image)}" alt="${escapeAttr(w.name)}" onerror="this.style.display='none'">` : ""}

        <div class="weapon-card-head">
          <div>
            <h3>${escapeHtml(w.name)}</h3>
            <p>${escapeHtml(w.class || "Unknown class")}${w.slot ? ` · ${escapeHtml(w.slot)}` : ""}</p>
          </div>
          ${w.changeCount ? `<span class="weapon-count-badge">${escapeHtml(w.changeCount)} changes</span>` : ""}
        </div>

        ${w.classname ? `<code class="weapon-classname">${escapeHtml(w.classname)}</code>` : ""}

        <div class="weapon-badges">
          ${(w.defindexes || []).length ? `<span class="tag">Item #${w.defindexes.map(escapeHtml).join(", #")}</span>` : ""}
          ${classnameRule ? `<span class="tag shared-rule-tag">Shared classname rule</span>` : ""}
          ${itemRule?.strip || classnameRule?.strip ? `<span class="tag warning-tag">Defaults stripped</span>` : ""}
          ${itemRule?.clip !== undefined ? `<span class="tag">Clip: ${escapeHtml(itemRule.clip)}</span>` : ""}
        </div>

        ${rules.length ? `
          <details class="weapon-details">
            <summary>Show FF2 changes</summary>
            <div class="weapon-details-body">
              ${rules.map(renderWeaponRule).join("")}
            </div>
          </details>
        ` : `<p class="weapon-no-change">No FF2 override data in the imported config.</p>`}
      </article>
    `;
  }).join("") || `<div class="empty-state">No weapons match the current filters.</div>`;
}

function renderWeaponRule(rule){
  const title = rule.source === "item"
    ? (rule.label || "Item-specific rule")
    : "Shared classname rule";

  const source = rule.source === "classname"
    ? (rule.sourceKey || rule.label || "")
    : (rule.sourceKey ? `Indexes: ${rule.sourceKey}` : "");

  return `
    <section class="weapon-rule ${rule.source === "classname" ? "classname-rule" : "item-rule"}">
      <div class="weapon-rule-head">
        <div>
          <strong>${escapeHtml(title)}</strong>
          ${source ? `<code>${escapeHtml(source)}</code>` : ""}
        </div>
        <span>${escapeHtml(ruleChangeCount(rule))} changes</span>
      </div>

      ${renderRuleFlags(rule)}
      ${renderAttributeGroup("Standard attributes", rule.attributes, false)}
      ${renderAttributeGroup("FF2 custom attributes", rule.custom, true)}

      ${Object.keys(rule.classOverrides || {}).length ? `
        <div class="class-override-list">
          <div class="rule-group-title">Class overrides</div>
          ${Object.entries(rule.classOverrides).map(([className, override]) => `
            <div class="class-override">
              <strong>${escapeHtml(className)}</strong>
              ${renderRuleFlags(override)}
              ${renderAttributeGroup("Standard attributes", override.attributes, false)}
              ${renderAttributeGroup("FF2 custom attributes", override.custom, true)}
            </div>
          `).join("")}
        </div>
      ` : ""}
    </section>
  `;
}

function renderRuleFlags(rule){
  const flags = [];

  if(rule.strip !== undefined){
    flags.push(`
      <span class="rule-flag ${rule.strip ? "danger" : ""}">
        ${rule.strip ? "Default weapon stats removed" : "Default weapon stats kept"}
      </span>
    `);
  }

  if(rule.clip !== undefined){
    flags.push(`<span class="rule-flag">Clip size: ${escapeHtml(rule.clip)}</span>`);
  }

  return flags.length ? `<div class="rule-flags">${flags.join("")}</div>` : "";
}

function renderAttributeGroup(title, attributes, custom){
  if(!attributes || !Object.keys(attributes).length) return "";

  const entries = Object.entries(attributes);
  const readable = entries
    .map(([name, value]) => describeWeaponAttribute(name, value, custom))
    .filter(Boolean)
    .filter(item => !item.technicalOnly);

  return `
    <div class="attribute-group ${custom ? "custom-attributes" : ""}">
      <div class="rule-group-title">${custom ? "FF2 effects" : "Gameplay changes"}</div>

      ${readable.length ? `
        <div class="player-attribute-list">
          ${readable.map(renderPlayerAttribute).join("")}
        </div>
      ` : `
        <div class="attribute-group-note">
          This rule only contains technical/internal settings.
        </div>
      `}

      <details class="technical-values">
        <summary>Technical values (${entries.length})</summary>
        <div class="attribute-list">
          ${entries.map(([name, value]) => `
            <div class="attribute-row">
              <span title="${escapeAttr(name)}">${escapeHtml(prettyWeaponAttribute(name))}</span>
              <code>${escapeHtml(value)}</code>
            </div>
          `).join("")}
        </div>
      </details>
    </div>
  `;
}

function renderPlayerAttribute(item){
  return `
    <div class="player-attribute-row ${item.kind ? `attribute-${escapeAttr(item.kind)}` : ""}">
      <span class="player-attribute-label">${escapeHtml(item.label)}</span>
      <strong class="player-attribute-value">${escapeHtml(item.value)}</strong>
      ${item.note ? `<small class="player-attribute-note">${escapeHtml(item.note)}</small>` : ""}
    </div>
  `;
}

function describeWeaponAttribute(name, value, custom = false){
  const key = normalizeWeaponAttribute(name);
  const n = weaponAttributeNumber(value);

  const row = (label, displayValue, note = "", kind = "") => ({
    label,
    value: displayValue,
    note,
    kind,
    technicalOnly: false
  });

  const technicalOnly = () => ({
    label: prettyWeaponAttribute(name),
    value: "",
    note: "",
    kind: "",
    technicalOnly: true
  });

  const enabled = n === null ? String(value) !== "0" : n !== 0;

  // ---------------------------------------------------------------
  // Damage dealt
  // ---------------------------------------------------------------
  if(["damage bonus", "damage penalty"].includes(key) && n !== null){
    return row("Damage", multiplierPercent(n), "", multiplierKind(n));
  }

  if(key === "dmg penalty vs players" && n !== null){
    return row("Damage vs players", multiplierPercent(n), "", multiplierKind(n));
  }

  if(key === "damage bonus vs burning" && n !== null){
    return row("Damage vs burning enemies", multiplierPercent(n), "", multiplierKind(n));
  }

  if(key === "damage bonus bullet vs sentry target" && n !== null){
    return row("Bullet damage vs Sentry target", multiplierPercent(n), "", multiplierKind(n));
  }

  if(key === "headshot damage increase" && n !== null){
    return row("Headshot damage", multiplierPercent(n), "", multiplierKind(n));
  }

  if(key === "weapon burn dmg increased" && n !== null){
    return row("Afterburn damage", multiplierPercent(n), "", multiplierKind(n));
  }

  if(key === "charge impact damage increased" && n !== null){
    return row("Shield charge impact damage", multiplierPercent(n), "", multiplierKind(n));
  }
  
  // ---------------------------------------------------------------
  // Damage taken / knockback
  // ---------------------------------------------------------------
  if(["dmg from melee increased", "dmg from ranged reduced", "dmg taken increased"].includes(key) && n !== null){
    const label = key === "dmg from melee increased"
      ? "Melee damage taken"
      : key === "dmg from ranged reduced"
        ? "Ranged damage taken"
        : "Damage taken";
    return row(label, multiplierTaken(n), "", n < 1 ? "positive" : n > 1 ? "negative" : "");
  }

  if(["dmg taken from fire reduced", "dmg taken from fire reduced on active"].includes(key) && n !== null){
    return row(
      key.endsWith("on active") ? "Fire damage taken while active" : "Fire damage taken",
      multiplierTaken(n),
      "",
      n < 1 ? "positive" : n > 1 ? "negative" : ""
    );
  }

  if(key === "dmg taken from bullets reduced" && n !== null){
  return row(
    "Bullet Resistance",
    `${n < 1 ? "+" : "-"}${formatAttributeNumber(Math.abs(1 - n) * 100)}%`,
    "",
    n < 1 ? "positive" : n > 1 ? "negative" : ""
  );
}

  if(key === "rocket jump damage reduction" && n !== null){
    return row("Rocket-jump self damage", multiplierTaken(n), "", n < 1 ? "positive" : "negative");
  }

  if(key === "blast dmg to self increased" && n !== null){
    return row("Self blast damage", multiplierTaken(n), "", n < 1 ? "positive" : n > 1 ? "negative" : "");
  }

  if(key === "damage force reduction" && n !== null){
    return row("Knockback taken", multiplierTaken(n), "", n < 1 ? "positive" : n > 1 ? "negative" : "");
  }

  if(key === "self dmg push force decreased" && n !== null){
    return row("Self-knockback", multiplierPercent(n), "", n < 1 ? "negative" : "positive");
  }

  if(key === "self dmg push force increased" && n !== null){
    return row("Self-knockback", multiplierPercent(n), "", n > 1 ? "positive" : "negative");
  }

  // ---------------------------------------------------------------
  // Spy cloak
  // ---------------------------------------------------------------
  if(key === "mult cloak meter consume rate" && n !== null){
    return row(
      "Cloak drain rate",
      signedMultiplierPercent(n),
      "",
      n < 1 ? "positive" : n > 1 ? "negative" : ""
    );
  }

  if(["cloak consume rate increased", "cloak consume rate decreased"].includes(key) && n !== null){
    return row(
      "Cloak drain rate",
      signedMultiplierPercent(n),
      "",
      n < 1 ? "positive" : n > 1 ? "negative" : ""
    );
  }

  if(["mult cloak meter regen rate", "cloak regen rate increased", "cloak regen rate decreased"].includes(key) && n !== null){
    return row(
      "Cloak regeneration rate",
      signedMultiplierPercent(n),
      "",
      n > 1 ? "positive" : n < 1 ? "negative" : ""
    );
  }

  // ---------------------------------------------------------------
  // Attack / reload / handling speed
  // ---------------------------------------------------------------
  if(["fire rate bonus", "fire rate penalty", "fire rate bonus hidden"].includes(key) && n !== null){
    return row("Attack speed", rateSpeedText(n), "", n < 1 ? "positive" : n > 1 ? "negative" : "");
  }

  if(key === "rocketjump attackrate bonus" && n !== null){
    return row("Attack speed while rocket jumping", rateSpeedText(n), "", n < 1 ? "positive" : n > 1 ? "negative" : "");
  }

  if(["reload time decreased", "reload time increased"].includes(key) && n !== null){
    return row("Reload time", timeMultiplierText(n), "", n < 1 ? "positive" : n > 1 ? "negative" : "");
  }

  if(["deploy time decreased", "single wep deploy time decreased"].includes(key) && n !== null){
    return row("Weapon draw time", timeMultiplierText(n), "", n < 1 ? "positive" : n > 1 ? "negative" : "");
  }

  if(key === "deploy time increased" && n !== null){
    return row("Weapon draw time", timeMultiplierText(n), "", n < 1 ? "positive" : "negative");
  }

  if(key === "switch from wep deploy time decreased" && n !== null){
    return row("Switch-away time", timeMultiplierText(n), "", n < 1 ? "positive" : n > 1 ? "negative" : "");
  }

  if(key === "single wep holster time increased" && n !== null){
    return row("Weapon holster time", timeMultiplierText(n), "", n < 1 ? "positive" : n > 1 ? "negative" : "");
  }

  if(["minigun spinup time decreased", "minigun spinup time increased"].includes(key) && n !== null){
    return row("Minigun spin-up time", timeMultiplierText(n), "", n < 1 ? "positive" : n > 1 ? "negative" : "");
  }

  if(key === "srifle charge rate decreased" && n !== null){
    return row("Sniper Rifle charge time", timeMultiplierText(n), "", n < 1 ? "positive" : n > 1 ? "negative" : "");
  }

  // ---------------------------------------------------------------
  // Ammo / clip
  // ---------------------------------------------------------------
  if(key === "maxammo primary increased" && n !== null){
    return row("Primary ammo", multiplierPercent(n), "", multiplierKind(n));
  }

  if(["maxammo secondary increased", "maxammo secondary reduced", "hidden secondary max ammo penalty"].includes(key) && n !== null){
    return row("Secondary ammo", multiplierPercent(n), "", multiplierKind(n));
  }

  if(key === "maxammo grenades1 increased" && n !== null){
    return row("Grenade ammo", multiplierPercent(n), "", multiplierKind(n));
  }

  if(["clip size bonus", "clip size penalty"].includes(key) && n !== null){
    return row("Clip size", multiplierPercent(n), "", multiplierKind(n));
  }

  if(key === "bullets per shot bonus" && n !== null){
    return row("Pellets per shot", multiplierPercent(n), "", multiplierKind(n));
  }

  if(key === "clipsize increase on kill" && n !== null){
    return row("Clip size on kill", `${signedNumber(n)} rounds`, "", n > 0 ? "positive" : "negative");
  }

  if(key === "ammo regen"){
    return row("Ammo regeneration", enabled ? "Enabled" : "Disabled", "", enabled ? "positive" : "");
  }

  // ---------------------------------------------------------------
  // Accuracy / projectile behavior
  // ---------------------------------------------------------------
  if(["weapon spread bonus", "spread penalty"].includes(key) && n !== null){
    return row("Weapon spread", spreadText(n), "", n < 1 ? "positive" : n > 1 ? "negative" : "");
  }

  if(key === "projectile speed increased" && n !== null){
    return row("Projectile speed", multiplierPercent(n), "", multiplierKind(n));
  }

  if(key === "blast radius decreased" && n !== null){
    return row("Blast radius", multiplierPercent(n), "", n < 1 ? "negative" : "positive");
  }

  if(key === "melee range multiplier" && n !== null){
    return row("Melee range", multiplierPercent(n), "", multiplierKind(n));
  }

  if(key === "flame life penalty" && n !== null){
    return row("Flame lifetime", multiplierPercent(n), "", n < 1 ? "negative" : "positive");
  }

  if(key === "flame speed" && n !== null){
    return row("Flame speed", `${formatAttributeNumber(n)} units/s`);
  }

  if(key === "flame spread degree" && n !== null){
    return row("Flame spread", `${formatAttributeNumber(n)}°`);
  }

  if(key === "afterburn duration penalty" && n !== null){
    return row("Afterburn duration", multiplierPercent(n), "", n < 1 ? "negative" : "positive");
  }

  // ---------------------------------------------------------------
  // Movement
  // ---------------------------------------------------------------
  if(["move speed bonus", "move speed penalty", "major move speed bonus"].includes(key) && n !== null){
    return row("Move speed", multiplierPercent(n), "", multiplierKind(n));
  }

  if(key === "aiming movespeed increased" && n !== null){
    return row("Move speed while aiming", multiplierPercent(n), "", multiplierKind(n));
  }

  if(key === "major increased jump height" && n !== null){
    return row("Jump height", multiplierPercent(n), "", multiplierKind(n));
  }

  if(["speed boost on hit", "speed boost on hit enemy"].includes(key) && n !== null){
    return row("Speed boost on hit", `${formatAttributeNumber(n)} sec`, "", "positive");
  }

  if(key === "mod air control blast jump" && n !== null){
    return row("Blast-jump air control", `×${formatAttributeNumber(n)}`, "", n > 1 ? "positive" : "");
  }

  // ---------------------------------------------------------------
  // Health / healing
  // ---------------------------------------------------------------
  if(["max health additive bonus", "max health additive penalty"].includes(key) && n !== null){
    return row("Max health", `${signedNumber(n)} HP`, "", n > 0 ? "positive" : n < 0 ? "negative" : "");
  }

  if(key === "health regen" && n !== null){
    return row("Health regeneration", `${signedNumber(n)} HP/sec`, "", n > 0 ? "positive" : "negative");
  }

  if(key === "restore health on kill" && n !== null){
    return row("Health on kill", `+${formatAttributeNumber(Math.abs(n))} HP`, "", "positive");
  }

  if(key === "heal on hit for rapidfire" && n !== null){
    return row("Health on hit", `+${formatAttributeNumber(Math.abs(n))} HP`, "", "positive");
  }

  if(key === "health from packs decreased" && n !== null){
    return row("Health from packs", multiplierPercent(n), "", n < 1 ? "negative" : "positive");
  }

  if(["health from healers reduced", "healing received penalty", "reduced healing from medics"].includes(key) && n !== null){
    return row("Healing received", multiplierPercent(n), "", n < 1 ? "negative" : "positive");
  }

  if(key === "patient overheal penalty" && n !== null){
    return row("Overheal received", multiplierPercent(n), "", n < 1 ? "negative" : "positive");
  }

  if(key === "overheal bonus" && n !== null){
    return row("Overheal amount", multiplierPercent(n), "", multiplierKind(n));
  }

  if(key === "lunchbox healing decreased" && n !== null){
    return row("Lunchbox healing", multiplierPercent(n), "", n < 1 ? "negative" : "positive");
  }

  // ---------------------------------------------------------------
  // Über / meters
  // ---------------------------------------------------------------
  if(key === "add uber charge on hit" && n !== null){
    return row("ÜberCharge on hit", `+${formatAttributeNumber(n * 100)}%`, "", "positive");
  }

  if(["ubercharge rate bonus", "ubercharge rate bonus for healer"].includes(key) && n !== null){
    return row("ÜberCharge build rate", multiplierPercent(n), "", multiplierKind(n));
  }

  if(key === "uber duration bonus" && n !== null){
    return row("Über duration", `×${formatAttributeNumber(n)}`, "", n > 1 ? "positive" : "");
  }

  if(key === "effect bar recharge rate increased" && n !== null){
    return row("Item meter recharge", `×${formatAttributeNumber(n)}`);
  }

  if(key === "charge recharge rate increased" && n !== null){
    return row("Charge recharge", `×${formatAttributeNumber(n)}`);
  }

  if(key === "item meter charge rate" && n !== null){
    return row("Item meter charge rate", formatAttributeNumber(n));
  }

  if(key === "mult item meter charge rate" && n !== null){
    return row("Item meter charge rate", `×${formatAttributeNumber(n)}`);
  }

  // ---------------------------------------------------------------
  // Crit / mini-crit effects and common toggles
  // ---------------------------------------------------------------
  const toggleEffects = {
    "crits become minicrits": ["Critical hits", "Become mini-crits"],
    "minicrits become crits": ["Mini-crits", "Become critical hits"],
    "crit vs burning players": ["Burning enemies", "Critical hits"],
    "minicrit vs burning player": ["Burning enemies", "Mini-crits"],
    "crit vs non burning players": ["Non-burning enemies", "Critical hits"],
    "mod mini-crit airborne": ["Airborne enemies", "Mini-crits"],
    "mod crit while airborne": ["While airborne", "Critical hits"],
    "set damagetype ignite": ["On hit", "Ignites enemies"],
    "drop health pack on kill": ["On kill", "Drops a health pack"],
    "airblast disabled": ["Airblast", "Disabled"],
    "backstab shield": ["Backstab shield", "Enabled"],
    "cannot disguise": ["Disguise", "Disabled"],
    "bidirectional teleport": ["Teleporters", "Two-way"],
    "revolver use hit locations": ["Revolver hit locations", "Enabled"],
    "auto fires full clip": ["Firing mode", "Automatically fires full clip"]
  };

  if(toggleEffects[key]){
    const [label, activeText] = toggleEffects[key];
    return row(label, enabled ? activeText : "Disabled", "", enabled ? "special" : "");
  }

  if(key === "hit self on miss"){
    return row("Missing a melee swing", enabled ? "Hurts you" : "No self-damage", "", enabled ? "negative" : "");
  }

  if(key === "weapon burn time increased" && n !== null){
    return row("Afterburn duration", multiplierPercent(n), "", multiplierKind(n));
  }

  if(key === "airblast cost increased" && n !== null){
    return row("Airblast ammo cost", multiplierPercent(n), "", n > 1 ? "negative" : "positive");
  }

  if(key === "increase buff duration" && n !== null){
    return row("Buff duration", multiplierPercent(n), "", multiplierKind(n));
  }

  // ---------------------------------------------------------------
  // FF2 custom attributes
  // ---------------------------------------------------------------
  if(custom){
    if(key === "knockback modifier" && n !== null){
      return row("Knockback modifier", `×${formatAttributeNumber(n)}`);
    }

    if(key === "backstab damage" && n !== null){
      return row("Backstab damage", `${formatAttributeNumber(n)} damage`, "", "positive");
    }

    if(key === "dmg taken from fall reduced" && n !== null){
      return row("Fall damage taken", multiplierTaken(n), "", n < 1 ? "positive" : "negative");
    }

    if(key === "primary weapon disabled"){
      return row("Primary weapon", enabled ? "Disabled" : "Enabled", "", enabled ? "negative" : "");
    }

    if(key === "secondary weapon disabled"){
      return row("Secondary weapon", enabled ? "Disabled" : "Enabled", "", enabled ? "negative" : "");
    }

    if(key === "mid-air damage vs bosses" && n !== null){
      return row("Mid-air damage vs bosses", `×${formatAttributeNumber(n)}`, "", n > 1 ? "positive" : "");
    }

    if(key === "medigun charge adds crit boost"){
      return row("Medi Gun charge", enabled ? "Also grants crit boost" : "Normal", "", enabled ? "positive" : "");
    }

    if(key === "melts on backstab"){
      return row("Backstab effect", enabled ? "Melts the victim" : "Disabled", "", "special");
    }

    if(key === "teleport on backstab"){
      return row("Backstab effect", enabled ? "Teleports you" : "Disabled", "", "special");
    }

    if(key === "health loss on backstab teleport" && n !== null){
      return row("Teleport backstab health cost", `${formatAttributeNumber(n)} HP`, "", n > 0 ? "negative" : "");
    }

    if(key === "rtd on backstab"){
      return row("Backstab effect", enabled ? "Triggers an RTD effect" : "Disabled", "", "special");
    }

    // Confirmed Panda FF2 meanings.
    if(key === "jarate limit" && n !== null){
      return row(
        "Maximum damage taken before Jarate effect disappears",
        formatAttributeNumber(n),
        "",
        "special"
      );
    }

    if(key === "jarate is rage loss" && n !== null){
      return row(
        "Rage lost upon getting Jarate'd",
        `${formatAttributeNumber(n)}%`,
        "",
        n > 0 ? "negative" : ""
      );
    }

    if(key === "mod crit type glow"){
      return row(
        "Forced Crit / Glow Type",
        ff2CritTypeText(value),
        "",
        "special"
      );
    }

    if(key === "mod crit type on bosses"){
      return row(
        "Forced Crit Type Against Bosses",
        ff2CritTypeText(value),
        "",
        "special"
      );
    }

    // Meanings for these are still intentionally not guessed.
    if([
      "mod airblast rage",
      "charge outlines bosses"
    ].includes(key)){
      return technicalOnly();
    }
  }

  // ---------------------------------------------------------------
  // Explicitly technical/internal standard attributes
  // ---------------------------------------------------------------
  if([
    "kill eater score type",
    "kill eater kill type",
    "item meter charge type",
    "item meter resupply denied",
    "grenades1 resupply denied",
    "decapitate type",
    "override projectile type"
  ].includes(key)){
    return technicalOnly();
  }

  // For attributes we do not have a dedicated human-readable conversion for,
  // show the configured value instead of hiding it behind "Modified".
  //
  // This keeps the page useful without guessing what a custom/internal value
  // means. The exact original key/value is still available under Technical values.
  if(n !== null){
    return row(
      prettyWeaponAttribute(name),
      formatAttributeNumber(n),
      custom ? "FF2 custom value" : "TF2 configured value",
      "neutral"
    );
  }

  return row(
    prettyWeaponAttribute(name),
    String(value),
    custom ? "FF2 custom value" : "TF2 configured value",
    "neutral"
  );
}

function ff2CritTypeText(value){
  const n = weaponAttributeNumber(value);

  if(n === 1) return "Minicrits";
  if(n === 2) return "Crits";
  if(n === 0) return "None";

  return `Type ${String(value)}`;
}

function normalizeWeaponAttribute(name){
  return String(name || "")
    .replace(/_/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function weaponAttributeNumber(value){
  const n = Number.parseFloat(String(value));
  return Number.isFinite(n) ? n : null;
}

function formatAttributeNumber(value, maxDecimals = 1){
  if(!Number.isFinite(value)) return String(value);

  const rounded = Math.round(value * (10 ** maxDecimals)) / (10 ** maxDecimals);
  return Number.isInteger(rounded)
    ? String(rounded)
    : String(rounded).replace(/0+$/, "").replace(/\.$/, "");
}

function signedNumber(value){
  const text = formatAttributeNumber(value);
  return value > 0 ? `+${text}` : text;
}

function signedMultiplierPercent(multiplier){
  if(!Number.isFinite(multiplier)) return String(multiplier);

  const percent = (multiplier - 1) * 100;
  const rounded = Math.abs(percent) < 0.000001
    ? 0
    : Math.round(percent * 100) / 100;

  if(rounded > 0) return `+${formatAttributeNumber(rounded, 2)}%`;
  if(rounded < 0) return `${formatAttributeNumber(rounded, 2)}%`;
  return "0%";
}

function multiplierPercent(multiplier){
  if(!Number.isFinite(multiplier)) return String(multiplier);

  const pct = (multiplier - 1) * 100;
  if(Math.abs(pct) < 0.05) return "Normal";

  return `${pct > 0 ? "+" : ""}${formatAttributeNumber(pct)}%`;
}

function multiplierTaken(multiplier){
  if(!Number.isFinite(multiplier)) return String(multiplier);

  const pct = (multiplier - 1) * 100;
  if(Math.abs(pct) < 0.05) return "Normal";

  return pct < 0
    ? `${formatAttributeNumber(Math.abs(pct))}% less`
    : `${formatAttributeNumber(pct)}% more`;
}

function multiplierKind(multiplier){
  if(multiplier > 1) return "positive";
  if(multiplier < 1) return "negative";
  return "";
}

function rateSpeedText(multiplier){
  if(!Number.isFinite(multiplier)) return String(multiplier);
  if(multiplier === 0) return "No attack delay";
  if(multiplier < 0) return `×${formatAttributeNumber(multiplier)}`;

  const rateChange = ((1 / multiplier) - 1) * 100;
  if(Math.abs(rateChange) < 0.05) return "Normal";

  return rateChange > 0
    ? `${formatAttributeNumber(rateChange)}% faster`
    : `${formatAttributeNumber(Math.abs(rateChange))}% slower`;
}

function timeMultiplierText(multiplier){
  if(!Number.isFinite(multiplier)) return String(multiplier);
  if(multiplier === 0) return "Instant";

  const pct = (multiplier - 1) * 100;
  if(Math.abs(pct) < 0.05) return "Normal";

  return pct < 0
    ? `${formatAttributeNumber(Math.abs(pct))}% shorter`
    : `${formatAttributeNumber(pct)}% longer`;
}

function spreadText(multiplier){
  if(!Number.isFinite(multiplier)) return String(multiplier);

  const pct = (multiplier - 1) * 100;
  if(Math.abs(pct) < 0.05) return "Normal";

  return pct < 0
    ? `${formatAttributeNumber(Math.abs(pct))}% tighter`
    : `${formatAttributeNumber(pct)}% wider`;
}

function ruleChangeCount(rule){
  let total = Object.keys(rule.attributes || {}).length + Object.keys(rule.custom || {}).length;
  if(rule.strip !== undefined) total++;
  if(rule.clip !== undefined) total++;
  Object.values(rule.classOverrides || {}).forEach(override => {
    total += ruleChangeCount(override);
  });
  return total;
}

function prettyWeaponAttribute(name){
  return String(name || "")
    .replace(/_/g, " ")
    .replace(/\bSRifle\b/gi, "Sniper Rifle")
    .replace(/\bdmg\b/gi, "damage")
    .replace(/\bwep\b/gi, "weapon")
    .replace(/\bmod\b/gi, "modifier")
    .replace(/\bmaxammo\b/gi, "max ammo")
    .replace(/\bminicrits\b/gi, "mini-crits")
    .replace(/\bcrits\b/gi, "crits")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, char => char.toUpperCase());
}

function renderBossNameList(names, targetSelector){
  const target = document.querySelector(targetSelector);
  if(!target) return;

  target.innerHTML = names.map(name => `
    <div class="boss-name-item">${escapeHtml(name)}</div>
  `).join("") || `<div class="empty-state">No bosses found.</div>`;
}

function renderBosses(query = ""){
  const q = query.toLowerCase().trim();

  const soloList = bosses.solo
    .filter(name => String(name).toLowerCase().includes(q))
    .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));

  const duoList = bosses.duos
    .filter(name => String(name).toLowerCase().includes(q))
    .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));

  renderBossNameList(soloList, "#solo-boss-list");
  renderBossNameList(duoList, "#duo-boss-list");

  const soloCount = document.querySelector("#solo-boss-count");
  const duoCount = document.querySelector("#duo-boss-count");

  if(soloCount) soloCount.textContent = soloList.length;
  if(duoCount) duoCount.textContent = duoList.length;
}

let mapSearchQuery = "";
let mapViewerIndex = -1;
let mapViewerAnimating = false;

function renderMaps(query = mapSearchQuery){
  mapSearchQuery = query;

  const q = query.toLowerCase().trim();

  const list = maps
    .map((map, cycleIndex) => ({ map, cycleIndex }))
    .filter(({ map }) => String(map).toLowerCase().includes(q));

  const count = document.querySelector("#map-result-count");
  if(count) count.textContent = list.length;

  const target = document.querySelector("#map-list");
  if(!target) return;

  target.innerHTML = list.map(({ map, cycleIndex }) => `
    <article class="map-entry">
      <button
        class="map-name-item map-toggle"
        type="button"
        data-map-open="${cycleIndex}"
        aria-haspopup="dialog"
        aria-label="Open preview for ${escapeAttr(map)}"
      >
        <span class="map-number">${cycleIndex + 1}</span>
        <code>${escapeHtml(map)}</code>
        <span class="map-view-label">View</span>
        <span class="map-toggle-indicator" aria-hidden="true">↗</span>
      </button>
    </article>
  `).join("") || `<div class="empty-state">No maps found.</div>`;
}

function ensureMapViewer(){
  let viewer = document.querySelector("#map-viewer");
  if(viewer) return viewer;

  viewer = document.createElement("div");
  viewer.id = "map-viewer";
  viewer.className = "map-viewer";
  viewer.hidden = true;
  viewer.setAttribute("aria-hidden", "true");

  viewer.innerHTML = `
    <div class="map-viewer-backdrop" data-map-viewer-close></div>

    <div
      class="map-viewer-shell"
      role="dialog"
      aria-modal="true"
      aria-labelledby="map-viewer-title"
    >
      <header class="map-viewer-header">
        <div class="map-viewer-heading">
          <span id="map-viewer-counter" class="map-viewer-counter"></span>
          <code id="map-viewer-title" class="map-viewer-title"></code>
        </div>

        <button
          class="map-viewer-close"
          type="button"
          data-map-viewer-close
          aria-label="Close map preview"
        >×</button>
      </header>

      <button
        class="map-viewer-nav map-viewer-prev"
        type="button"
        data-map-viewer-prev
        aria-label="Previous map"
      >
        <span class="map-viewer-arrow" aria-hidden="true">‹</span>
        <span class="map-viewer-nav-label">Previous</span>
      </button>

      <div class="map-viewer-stage">
        <div id="map-viewer-slide" class="map-viewer-slide">
          <img
            id="map-viewer-image"
            class="map-viewer-image"
            alt=""
            decoding="async"
          >
          <div id="map-viewer-fallback" class="map-viewer-fallback" hidden></div>
        </div>
      </div>

      <button
        class="map-viewer-nav map-viewer-next"
        type="button"
        data-map-viewer-next
        aria-label="Next map"
      >
        <span class="map-viewer-nav-label">Next</span>
        <span class="map-viewer-arrow" aria-hidden="true">›</span>
      </button>

      <div class="map-viewer-hint">
        <span>← / → Next map</span>
        <span>Esc Close</span>
      </div>
    </div>
  `;

  document.body.appendChild(viewer);

  viewer.querySelectorAll("[data-map-viewer-close]").forEach(button => {
    button.addEventListener("click", closeMapViewer);
  });

  viewer.querySelector("[data-map-viewer-prev]").addEventListener("click", () => {
    changeMapViewer(-1);
  });

  viewer.querySelector("[data-map-viewer-next]").addEventListener("click", () => {
    changeMapViewer(1);
  });

  return viewer;
}

function openMapViewer(index){
  if(!maps.length) return;

  mapViewerIndex = Math.max(0, Math.min(Number(index) || 0, maps.length - 1));

  const viewer = ensureMapViewer();
  viewer.hidden = false;
  viewer.setAttribute("aria-hidden", "false");
  document.body.classList.add("map-viewer-open");

  setMapViewerContent(mapViewerIndex, 0);

  requestAnimationFrame(() => {
    viewer.classList.add("map-viewer-visible");
    viewer.querySelector(".map-viewer-close")?.focus({ preventScroll: true });
  });
}

function closeMapViewer(){
  const viewer = document.querySelector("#map-viewer");
  if(!viewer || viewer.hidden) return;

  viewer.classList.remove("map-viewer-visible");
  document.body.classList.remove("map-viewer-open");
  mapViewerAnimating = false;

  window.setTimeout(() => {
    if(!viewer.classList.contains("map-viewer-visible")){
      viewer.hidden = true;
      viewer.setAttribute("aria-hidden", "true");
    }
  }, 180);
}

function changeMapViewer(direction){
  if(mapViewerAnimating || !maps.length) return;

  const nextIndex = (mapViewerIndex + direction + maps.length) % maps.length;
  setMapViewerContent(nextIndex, direction);
}

function setMapViewerContent(index, direction = 0){
  const viewer = ensureMapViewer();
  const slide = viewer.querySelector("#map-viewer-slide");

  if(direction === 0){
    mapViewerIndex = index;
    updateMapViewerMedia(index);
    return;
  }

  mapViewerAnimating = true;

  slide.classList.remove(
    "map-slide-out-left",
    "map-slide-out-right",
    "map-slide-in-left",
    "map-slide-in-right"
  );

  slide.classList.add(direction > 0 ? "map-slide-out-left" : "map-slide-out-right");

  window.setTimeout(() => {
    mapViewerIndex = index;
    updateMapViewerMedia(index);

    slide.classList.remove("map-slide-out-left", "map-slide-out-right");
    slide.classList.add(direction > 0 ? "map-slide-in-right" : "map-slide-in-left");

    // Force the incoming transform to apply before animating back to center.
    void slide.offsetWidth;

    requestAnimationFrame(() => {
      slide.classList.remove("map-slide-in-left", "map-slide-in-right");

      window.setTimeout(() => {
        mapViewerAnimating = false;
      }, 190);
    });
  }, 150);
}

function updateMapViewerMedia(index){
  const viewer = ensureMapViewer();
  const map = maps[index];
  const imageUrl = String(mapImages[map] || "").trim();

  const title = viewer.querySelector("#map-viewer-title");
  const counter = viewer.querySelector("#map-viewer-counter");
  const image = viewer.querySelector("#map-viewer-image");
  const fallback = viewer.querySelector("#map-viewer-fallback");

  title.textContent = map;
  counter.textContent = `${index + 1} / ${maps.length}`;

  image.onload = null;
  image.onerror = null;
  image.removeAttribute("src");
  image.alt = `Preview of ${map}`;
  image.hidden = true;
  fallback.hidden = true;
  fallback.textContent = "";

  if(imageUrl){
    image.onload = () => {
      image.hidden = false;
      fallback.hidden = true;
    };

    image.onerror = () => {
      image.hidden = true;
      fallback.textContent = "Image could not be loaded.";
      fallback.hidden = false;
    };

    image.src = imageUrl;

    // Cached images may already be complete before the load handler fires.
    if(image.complete && image.naturalWidth > 0){
      image.hidden = false;
      fallback.hidden = true;
    }
  }else{
    fallback.textContent = "No image available for this map yet.";
    fallback.hidden = false;
  }

  preloadMapViewerNeighbours(index);
}

function preloadMapViewerNeighbours(index){
  if(maps.length < 2) return;

  const indexes = [
    (index - 1 + maps.length) % maps.length,
    (index + 1) % maps.length
  ];

  indexes.forEach(i => {
    const url = String(mapImages[maps[i]] || "").trim();
    if(!url) return;

    const preload = new Image();
    preload.src = url;
  });
}

function renderCommands(query = ""){
  const q = query.toLowerCase().trim();
  const list = commands.filter(c =>
    `${c.command || ""} ${c.title || ""} ${c.description || ""} ${c.category || ""}`
      .toLowerCase()
      .includes(q)
  );

  document.querySelector("#command-list").innerHTML = list.map(c => `
    <article class="command-card">
      <code>${escapeHtml(c.command)}</code>
      <div>
        <h3>${escapeHtml(c.title)}</h3>
        <p>${escapeHtml(c.description)}</p>
      </div>
      <span class="command-meta">${escapeHtml(c.category)}</span>
    </article>
  `).join("") || `<div class="empty-state">No matching commands found.</div>`;
}

let activeChangeFilter = "all";
let activeActionFilter = "all";
let changelogSearchQuery = "";

function normalizeChangeCategory(value){
  const key = String(value || "").trim().toLowerCase();
  if(key === "bosses") return "boss";
  if(key === "weapons") return "weapon";
  if(key === "map") return "maps";
  return key || "other";
}

function inferLegacyChangeAction(entry){
  const text = `${entry?.title || ""} ${entry?.summary || ""}`.toLowerCase();

  if(/\bre-?added\b|\badded\b|\bintroduced\b/.test(text)) return "added";
  if(/\bremoved\b|\bremoval\b/.test(text)) return "removed";
  if(/\bfixed\b|\bfix\b/.test(text)) return "fixed";
  if(String(entry?.status || "").toLowerCase() === "reference") return "reference";
  return "changed";
}

function normalizeChangelogData(data){
  const list = Array.isArray(data) ? data : [];

  return list.map((entry, index) => {
    if(Array.isArray(entry?.changes)){
      return {
        date: String(entry.date || ""),
        title: String(entry.title || `Update ${index + 1}`),
        status: String(entry.status || ""),
        source: String(entry.source || ""),
        changes: entry.changes.map(change => ({
          type: normalizeChangeCategory(change?.type),
          action: String(change?.action || "changed").toLowerCase(),
          title: String(change?.title || "Change"),
          description: String(change?.description || change?.summary || "")
        }))
      };
    }

    return {
      date: String(entry?.date || ""),
      title: String(entry?.title || `Update ${index + 1}`),
      status: String(entry?.status || ""),
      source: String(entry?.source || ""),
      changes: [{
        type: normalizeChangeCategory(entry?.type),
        action: inferLegacyChangeAction(entry),
        title: String(entry?.title || "Change"),
        description: String(entry?.summary || "")
      }]
    };
  }).sort((a, b) => new Date(`${b.date}T00:00:00`) - new Date(`${a.date}T00:00:00`));
}

const changelogUpdates = normalizeChangelogData(changelog);

function changeActionMeta(action){
  const normalized = String(action || "changed").toLowerCase();

  const meta = {
    added:     { symbol: "+", label: "Added" },
    changed:   { symbol: "~", label: "Changed" },
    fixed:     { symbol: "✓", label: "Fixed" },
    removed:   { symbol: "−", label: "Removed" },
    reference: { symbol: "i", label: "Reference" }
  };

  return meta[normalized] || { symbol: "•", label: prettyChangeLabel(normalized) };
}

function prettyChangeLabel(value){
  const text = String(value || "other").replace(/[_-]+/g, " ");
  return text.replace(/\b\w/g, char => char.toUpperCase());
}

function categoryDisplayName(type){
  const names = {
    weapon: "Weapons",
    boss: "Bosses",
    gameplay: "Gameplay",
    maps: "Maps",
    other: "Other"
  };
  return names[normalizeChangeCategory(type)] || prettyChangeLabel(type);
}

function isHttpUrl(value){
  return /^https?:\/\//i.test(String(value || "").trim());
}

function filterChangelogUpdates(){
  const q = changelogSearchQuery.toLowerCase().trim();

  return changelogUpdates.map(update => {
    const updateSearchText = `
      ${update.date}
      ${update.title}
      ${update.status}
      ${update.source}
    `.toLowerCase();

    const updateMatchesQuery = q && updateSearchText.includes(q);

    const changes = update.changes.filter(change => {
      const categoryMatches =
        activeChangeFilter === "all" ||
        normalizeChangeCategory(change.type) === activeChangeFilter;

      const actionMatches =
        activeActionFilter === "all" ||
        String(change.action || "").toLowerCase() === activeActionFilter;

      if(!categoryMatches || !actionMatches) return false;
      if(!q || updateMatchesQuery) return true;

      const changeSearchText = `
        ${change.type}
        ${categoryDisplayName(change.type)}
        ${change.action}
        ${change.title}
        ${change.description}
      `.toLowerCase();

      return changeSearchText.includes(q);
    });

    return { ...update, changes };
  }).filter(update => update.changes.length);
}

function renderLatestChangelogUpdate(){
  const target = document.querySelector("#changelog-latest");
  if(!target) return;

  const latest = changelogUpdates[0];

  if(!latest){
    target.innerHTML = "";
    return;
  }

  const categoryCounts = latest.changes.reduce((counts, change) => {
    const type = normalizeChangeCategory(change.type);
    counts[type] = (counts[type] || 0) + 1;
    return counts;
  }, {});

  const categoryBadges = Object.entries(categoryCounts).map(([type, count]) => `
    <span class="latest-change-stat" data-type="${escapeAttr(type)}">
      <strong>${escapeHtml(count)}</strong>
      ${escapeHtml(categoryDisplayName(type))}
    </span>
  `).join("");

  target.innerHTML = `
    <article class="latest-change-card">
      <div class="latest-change-main">
        <div class="latest-change-topline">
          <span class="latest-change-label">Latest update</span>
          ${latest.status ? `<span class="latest-change-status">${escapeHtml(latest.status)}</span>` : ""}
        </div>

        <time datetime="${escapeAttr(latest.date)}">${escapeHtml(formatDate(latest.date))}</time>
        <h3>${escapeHtml(latest.title)}</h3>

        <div class="latest-change-stats">
          <span class="latest-change-stat total">
            <strong>${latest.changes.length}</strong>
            ${latest.changes.length === 1 ? "Change" : "Changes"}
          </span>
          ${categoryBadges}
        </div>
      </div>

      <button class="latest-change-jump" type="button" data-changelog-jump>
        View update ↓
      </button>
    </article>
  `;
}

function renderChangelog(){
  const list = filterChangelogUpdates();
  const target = document.querySelector("#changelog-list");
  if(!target) return;

  renderLatestChangelogUpdate();

  const totalChanges = list.reduce((sum, update) => sum + update.changes.length, 0);
  const changeCounter = document.querySelector("#changelog-result-count");
  const updateCounter = document.querySelector("#changelog-update-count");

  if(changeCounter) changeCounter.textContent = totalChanges;
  if(updateCounter) updateCounter.textContent = list.length;

  const filtering =
    changelogSearchQuery.trim() ||
    activeChangeFilter !== "all" ||
    activeActionFilter !== "all";

  target.innerHTML = list.map((update, updateIndex) => {
    const groups = update.changes.reduce((result, change) => {
      const type = normalizeChangeCategory(change.type);
      if(!result[type]) result[type] = [];
      result[type].push(change);
      return result;
    }, {});

    const categoryOrder = ["weapon", "boss", "gameplay", "maps", "other"];
    const orderedTypes = [
      ...categoryOrder.filter(type => groups[type]?.length),
      ...Object.keys(groups).filter(type => !categoryOrder.includes(type))
    ];

    const sourceHtml = update.source
      ? isHttpUrl(update.source)
        ? `<a class="change-update-source" href="${escapeAttr(update.source)}" target="_blank" rel="noreferrer">View source ↗</a>`
        : `<span class="change-update-source-note">Source: ${escapeHtml(update.source)}</span>`
      : "";

    const shouldOpen = filtering || updateIndex === 0;

    return `
      <details class="change-update" ${shouldOpen ? "open" : ""}>
        <summary class="change-update-summary">
          <div class="change-update-date">
            <span>${escapeHtml(formatDate(update.date))}</span>
            ${update.status ? `<small>${escapeHtml(update.status)}</small>` : ""}
          </div>

          <div class="change-update-heading">
            <h3>${escapeHtml(update.title)}</h3>
            <span>
              ${update.changes.length}
              ${update.changes.length === 1 ? "change" : "changes"}
            </span>
          </div>

          <span class="change-update-chevron" aria-hidden="true">⌄</span>
        </summary>

        <div class="change-update-body">
          ${orderedTypes.map(type => `
            <section class="change-category-group" data-type="${escapeAttr(type)}">
              <div class="change-category-title">
                <span>${escapeHtml(categoryDisplayName(type))}</span>
                <small>${groups[type].length}</small>
              </div>

              <div class="change-entry-list">
                ${groups[type].map(change => {
                  const action = changeActionMeta(change.action);
                  return `
                    <article class="change-entry" data-action="${escapeAttr(change.action)}">
                      <span class="change-action-symbol" aria-hidden="true">${escapeHtml(action.symbol)}</span>

                      <div class="change-entry-copy">
                        <div class="change-entry-title-row">
                          <span class="change-action-label">${escapeHtml(action.label)}</span>
                          <strong>${escapeHtml(change.title)}</strong>
                        </div>
                        ${change.description ? `<p>${escapeHtml(change.description)}</p>` : ""}
                      </div>
                    </article>
                  `;
                }).join("")}
              </div>
            </section>
          `).join("")}

          ${sourceHtml ? `<div class="change-update-footer">${sourceHtml}</div>` : ""}
        </div>
      </details>
    `;
  }).join("") || `
    <div class="empty-state">
      No changelog entries match the current search and filters.
    </div>
  `;
}

document.querySelector("#weapon-search").addEventListener("input", e => {
  weaponSearchQuery = e.target.value;
  renderWeapons();
});

document.querySelector("#weapon-class-filter").addEventListener("change", e => {
  weaponClassFilter = e.target.value;
  renderWeapons();
});
document.querySelector("#boss-search").addEventListener("input", e => renderBosses(e.target.value));
document.querySelector("#map-search")?.addEventListener("input", e => {
  mapSearchQuery = e.target.value;
  renderMaps();
});

document.querySelector("#map-list")?.addEventListener("click", e => {
  const button = e.target.closest("[data-map-open]");
  if(!button) return;

  openMapViewer(Number(button.dataset.mapOpen));
});

document.addEventListener("keydown", e => {
  const viewer = document.querySelector("#map-viewer");
  if(!viewer || viewer.hidden) return;

  if(e.key === "Escape"){
    e.preventDefault();
    closeMapViewer();
    return;
  }

  if(e.key === "ArrowLeft"){
    e.preventDefault();
    changeMapViewer(-1);
    return;
  }

  if(e.key === "ArrowRight"){
    e.preventDefault();
    changeMapViewer(1);
  }
});


document.querySelector("#command-search").addEventListener("input", e => renderCommands(e.target.value));

document.querySelector("#changelog-search")?.addEventListener("input", e => {
  changelogSearchQuery = e.target.value;
  renderChangelog();
});

document.querySelectorAll("[data-change-filter]").forEach(btn => {
  btn.addEventListener("click", () => {
    activeChangeFilter = btn.dataset.changeFilter;

    document.querySelectorAll("[data-change-filter]").forEach(
      b => b.classList.toggle("active", b === btn)
    );

    renderChangelog();
  });
});

document.querySelectorAll("[data-action-filter]").forEach(btn => {
  btn.addEventListener("click", () => {
    activeActionFilter = btn.dataset.actionFilter;

    document.querySelectorAll("[data-action-filter]").forEach(
      b => b.classList.toggle("active", b === btn)
    );

    renderChangelog();
  });
});

document.querySelector("#changelog-latest")?.addEventListener("click", e => {
  const button = e.target.closest("[data-changelog-jump]");
  if(!button) return;

  document.querySelector("#changelog-list")?.scrollIntoView({
    behavior: "smooth",
    block: "start"
  });
});

const fileInput = document.querySelector("#cfg-file");
const drop = document.querySelector("#dropzone");
const output = document.querySelector("#analysis-output");

fileInput.addEventListener("change", e => e.target.files[0] && analyze(e.target.files[0]));

["dragenter", "dragover"].forEach(ev =>
  drop.addEventListener(ev, e => {
    e.preventDefault();
    drop.classList.add("drag");
  })
);

["dragleave", "drop"].forEach(ev =>
  drop.addEventListener(ev, e => {
    e.preventDefault();
    drop.classList.remove("drag");
  })
);

drop.addEventListener("drop", e => e.dataTransfer.files[0] && analyze(e.dataTransfer.files[0]));

async function analyze(file){
  output.classList.remove("hidden");
  output.innerHTML = `<div class="result"><h3>Parsing configuration…</h3><p>Please wait.</p></div>`;

  try{
    const text = await file.text();
    const root = parseKeyValues(text);
    const items = extractItems(root);

    const custom = items.reduce(
      (n, i) => n + i.blocks.reduce((m, b) => m + b.custom.length, 0),
      0
    );
    const official = items.reduce(
      (n, i) => n + i.blocks.reduce((m, b) => m + b.official.length, 0),
      0
    );

    output.innerHTML = `
      <div class="summary">
        <div class="stat"><b>${items.length}</b><span>Parsed items</span></div>
        <div class="stat"><b>${official}</b><span>Official attributes</span></div>
        <div class="stat"><b>${custom}</b><span>Custom / FF2 attributes</span></div>
        <div class="stat"><b>${items.filter(i => i.blocks.some(b => b.className)).length}</b><span>Class overrides</span></div>
      </div>

      ${items.map(i => `
        <article class="result">
          <h3>${escapeHtml(i.name || i.id)}</h3>
          <p>${escapeHtml(i.id)}</p>

          ${i.blocks.map(b => `
            <div>
              <strong>${b.className ? escapeHtml(b.className) : "Default"}</strong>
              <pre>${escapeHtml([
                ...b.official.map(x => `${x.key}: ${x.value}`),
                ...b.custom.map(x => `${x.key}: ${x.value}`)
              ].join("\n"))}</pre>
            </div>
          `).join("")}
        </article>
      `).join("")}
    `;
  }catch(err){
    output.innerHTML = `
      <div class="result">
        <h3>Could not parse file</h3>
        <p>${escapeHtml(err.message)}</p>
      </div>
    `;
  }
}

function formatDate(value){
  const date = new Date(`${value}T00:00:00`);
  return new Intl.DateTimeFormat("en", {
    year: "numeric",
    month: "short",
    day: "numeric"
  }).format(date);
}

function escapeHtml(value){
  return String(value ?? "").replace(/[&<>"']/g, c => ({
    "&":"&amp;",
    "<":"&lt;",
    ">":"&gt;",
    "\"":"&quot;",
    "'":"&#39;"
  }[c]));
}

function escapeAttr(value){
  return escapeHtml(value);
}

renderWeapons();
renderBosses();
renderMaps();
renderCommands();
renderChangelog();
