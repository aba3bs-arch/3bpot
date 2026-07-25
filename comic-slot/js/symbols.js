/* Comic Slot symbols — glossy generated art */
window.ComicSymbols = (function () {
    'use strict';

    const SRC = {
        poop: 'assets/poop.png',
        banana: 'assets/banana.png',
        taco: 'assets/taco.png',
        donut: 'assets/donut.png',
        alien: 'assets/alien.png',
        clown: 'assets/clown.png',
        unicorn: 'assets/unicorn.png',
        wild: 'assets/wild.png',
    };

    function render(id) {
        const key = SRC[id] ? id : 'banana';
        return `<img class="sym-img" src="${SRC[key]}" alt="" draggable="false">`;
    }

    return { render };
})();
