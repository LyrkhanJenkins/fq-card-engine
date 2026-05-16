
export default class DisplayCard {
    static getFirstNumberForCardSvg(str) {
        //TODO Handle X and Y
        if (str === "") {
            return "0";
        }
        const matches = str.match(/\d+/g);
        if (!matches) return "0";
        if (matches.length > 1) return "S";
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
        let description = c.back.text;
        if (c.face != null) {
            if (!c.faces) {
                description = undefined;
            } else {
                description = c.faces[c.face].text;
            }
        }
        if (c.face && !img) {
            description = c.data.faces[c.data.face].text;
        }
        return game.i18n.localize(description);
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
}