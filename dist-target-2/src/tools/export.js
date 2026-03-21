export function evermemoryExport(transferService, input = {}) {
    return transferService.exportSnapshot(input);
}
