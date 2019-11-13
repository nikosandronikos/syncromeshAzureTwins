class Node {
    constructor(value) {
        this.value = value;
        this.children = new Map();
    }

    addChild(name, value) {
        this.children.set(name, new Node(value));
    }

    findChild(findName) {
        if (this.children.has(findName)) return this.children.get(findName);

        for (const [name, child] of this.children.entries()) {
            const r = child.find(findName);
            if (r) return r;
        }

        return null;
    }
}

class Graph {
    constructor() {
        this.head = new Node();
    }
}

const g = new Graph();

g.head.addChild('one', 1);
g.head.addChild('two', 4);
g.head.find('two').addChild('three', 3);
