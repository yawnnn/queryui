export function cloneSelections(selections = {}) {
    return {
        table: selections.table ?? "",
        cols: Array.isArray(selections.cols) ? [...selections.cols] : [],
        where: selections.where ?? "",
        order: selections.order ?? "",
        limit: selections.limit ?? "",
        distinct: Boolean(selections.distinct),
    };
}

export function createHistory() {
    return {
        lst: [],
        idx: -1,
    };
}

export function pushHistory(history, selections) {
    history.lst = history.lst.slice(0, history.idx + 1);
    history.lst.push(cloneSelections(selections));
    history.idx = history.lst.length - 1;
}

export function canGoPrev(history) {
    return history.idx > 0;
}

export function canGoNext(history) {
    return history.idx >= 0 && history.idx < history.lst.length - 1;
}

export function goPrev(history) {
    if (!canGoPrev(history))
        return null;

    history.idx -= 1;

    return cloneSelections(history.lst[history.idx]);
}

export function goNext(history) {
    if (!canGoNext(history))
        return null;

    history.idx += 1;
    
    return cloneSelections(history.lst[history.idx]);
}