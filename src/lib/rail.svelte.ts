// What the title rail (TitleBar.svelte) shows: the open document's name and whether it has unsaved changes. Set by Workspace / Portfolio.
export const rail = $state({ name: '', modified: false });
