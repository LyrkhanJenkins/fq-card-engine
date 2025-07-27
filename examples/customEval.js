!game.user.targets.size || ([...game.user.targets].filter(t => Math.abs(t.document.x - game.canvas?.scene?.tokens?.find(t => t.actor?.id === game.user?.character?.id).x)
    === Math.abs(t.document.y - game.canvas?.scene?.tokens?.find(t => t.actor?.id === game.user?.character?.id).y)).length === [...game.user.targets].length);
