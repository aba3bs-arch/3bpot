/* Premium slot symbols — glossy generated art */
window.CrystalSymbols = (function () {
    'use strict';

    const SRC = {
        cherry: 'assets/cherry.png',
        orange: 'assets/orange.png',
        lemon: 'assets/lemon.png',
        plum: 'assets/plum.png',
        seven: 'assets/seven.png',
        wild: 'assets/crystal.png',
    };

    function render(id) {
        const key = SRC[id] ? id : 'cherry';
        return `<img class="sym-img" src="${SRC[key]}" alt="" draggable="false">`;
    }

    return { render };
})();
