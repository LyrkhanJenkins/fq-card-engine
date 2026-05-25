import FqConstants from "./fq-constants.js";

export default class DisplayCard {
    // TODO Reactif, Replayable, couleurs pour les gains ou pertes des bullles, changer la taille des fonts des bulles également

    static getNumberForBubbleCardSvg(str, cardContent) {
        if (str === "") {
            return "0";
        }
        if ((str.includes("XXX") && !cardContent.xvalue) || (str.includes("YYY") && !cardContent.yvalue)) {
            return str.replace("XXX","X").replace("YYY","Y").replace("(","").replace(")","").replace("*","");
        }
        const matches = str.match(/-?\d+/g);
        if (!matches) return "0";
        if (matches.length > 1) return "S";
        if (matches[0] > 99) return "∞";
        return matches[0];
    }

    static getDescriptionSizeForCardSvg(description) {
        let descriptionSize = {1: 40, 80: 36, 110: 34, 145: 30, 200: 26, 290: 22, 340: 20, 440: 18, 9999: 16};
        return descriptionSize[Object.keys(descriptionSize)
            .map(Number)
            .sort((a, b) => a - b)
            .find(limit => description.length <= limit)];
    }

    static getTitleSizeForCardSvg(title) {
        let titleSize = {1: 34, 20: 32, 25: 28, 30: 24, 9999: 20};

        return titleSize[Object.keys(titleSize)
            .map(Number)
            .sort((a, b) => a - b)
            .find(limit => title.length <= limit)];
    }

    static getDescriptionFromCard(c) {
        let description = "";
        if (c.face != null) {
            if (!c.faces) {
                description = undefined;
            } else {
                description = c.faces[c.face].text;
            }
        }
        if (c.face && !description) {
            description = c.data.faces[c.data.face].text;
        }
        const flat = Object.fromEntries(
            c.system.fq?.choices.flatMap((choice, i) =>
                Object.entries(choice).map(([k, v]) => [`${i}_${k}`, v])
            )
        );
        return DisplayCard.transformForDescription(game.i18n.format(description, flat));
    }

    static getNameFromCard(c) {
        let name = (c.face !== null) ? c.name : "FQCARDENGINE.CardBack";
        return game.i18n.localize(name);
    }

    static getImgFromCard(c) {
        let img = c.back.img;
        if (c.face != null) {
            if (!c.faces) {
                img = undefined;
            } else {
                img = c.faces[c.face].img;
            }
        }
        if (c.face && !img) {
            img = c.data.faces[c.data.face].img;
        }
        return img;
    }

    static transformForDescription(val) {
        const abilities = FqConstants.actorAbi;
        if (typeof val === "string") {
            return  val.replace("XXX","X").replace("YYY","Y")
                .replace(/@int/g, abilities?.int?.mod + "(🧠)")
                .replace(/@wis/g, abilities?.wis?.mod + "(🦉)")
                .replace(/@cha/g, abilities?.cha?.mod + "(✨️)")
                .replace(/@str/g, abilities?.str?.mod + "(💪)")
                .replace(/@dex/g, abilities?.dex?.mod + "(🎯)")
                .replace(/@con/g, abilities?.con?.mod + "(❤️)")
                .replace(/\[acid]/g, "[🧪]")
                .replace(/\[bludgeoning]/g, "[⚒️]")
                .replace(/\[cold]/g, "[🧊]")
                .replace(/\[fire]/g, "[🔥]")
                .replace(/\[force]/g, "[🌀]")
                .replace(/\[lightning]/g, "[🌩️]")
                .replace(/\[necrotic]/g, "[🩸]")
                .replace(/\[piercing]/g, "[🏹]")
                .replace(/\[poison]/g, "[☠️]")
                .replace(/\[psychic]/g, "[👁️]")
                .replace(/\[radiant]/g, "[☀️]")
                .replace(/\[slashing]/g, "[🗡️]")
                .replace(/\[thunder]/g, "[🌪️]");
        }
        return val;
    }
}