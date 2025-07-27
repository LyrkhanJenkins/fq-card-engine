socket = socketlib.registerModule(FqCardEngineModule.moduleName);
socket.executeAsGM("deleteDeckForUser", game.userId);
