const charging = (game.user.character.flags.fq?.bladeCharging ? game.user.character.flags.fq.bladeCharging : 0) + Number(5);
if (charging > 12) {
    false;
} else {
    game.user.character.flags.fq = { ...game.user.character.flags.fq, ...{ bladeCharging: charging } };
}