Hooks.on("renderGamePause", (app, html) => {
    html.classList.add("dnd5e2");
    html.classList.add("fq-card-engine");
    const container = document.createElement("div");
    container.classList.add("flexcol");
    container.append(...html.children);
    html.append(container);
    const img = html.querySelector("img");
    if (img) {
        img.src = "modules/fq-card-engine/images/logo.png";
        img.className = "";
    }
});
