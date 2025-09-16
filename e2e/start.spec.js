// @ts-check
import {test, expect} from "@playwright/test";

//Need launch With FQ-Playwright
test.only("has title", async ({page}) => {
    await page.goto("/join");

    const viewport = page.viewportSize();
    if (!viewport) throw new Error("Pas de viewport défini");

    const centerX = viewport.width / 2;
    const centerY = viewport.height / 2;

    // Expect a title "to contain" a substring.
    await expect(page).toHaveTitle(/FQ-Playwright/);
    await page.getByRole("combobox").selectOption("PVPKsAtAr8JdsBbL");
    await page.getByRole("button", {name: " Join Game Session"}).click();
    await expect(page).toHaveTitle(/Foundry Virtual Tabletop/);
    await page.getByRole("tab", {name: "Game Settings"}).click();
    await page.getByRole("button", {name: "Manage Modules"}).click();
    await page.getByLabel("FQ Card Engine").click();
    await page.getByRole("button", {name: "Deactivate", exact: true}).click();
    await page.getByLabel("FQ Card Engine").click();
    await page.getByRole("button", {name: "Activate", exact: true}).click();
    await page.getByRole("button", {name: "Save Module Settings"}).click();
    await page.getByRole("tab", {name: "Compendium Packs"}).click();
    await page.getByText("FQ8 Assets").click();
    await page.getByText("Classes", {exact: true}).click();
    await page.getByText("Elementalist").click();
    await page.getByLabel("Edit").locator("div").first().click();
    await page.locator(".meter.sectioned.action-points").click();
    await page.locator("input[name=\"system.fq.action.value\"]").click();
    await page.locator("input[name=\"system.fq.action.value\"]").fill("11");
    await page.locator("input[name=\"system.fq.action.value\"]").press("Enter");
    await page.locator("input[name=\"system.fq.action.max\"]").click();
    await page.locator("input[name=\"system.fq.action.max\"]").fill("10");
    await page.locator("input[name=\"system.fq.action.max\"]").press("Enter");
    await page.locator("input[name=\"system.fq.mana.value\"]").click();
    await page.locator("input[name=\"system.fq.mana.value\"]").fill("4");
    await page.locator("input[name=\"system.fq.mana.max\"]").click();
    await page.locator("input[name=\"system.fq.mana.max\"]").fill("4");


})
;
