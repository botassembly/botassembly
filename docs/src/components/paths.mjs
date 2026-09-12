// A corpus path is long and its last segment is a file name. Breaking a name
// in half reads as two files, so the tree breaks only after a slash. These two
// helpers give the template and the client script the same split.

/** The directory part, one segment per entry, each keeping its slash. */
export function directorySegments(path) {
	const cut = path.lastIndexOf('/') + 1;
	return path
		.slice(0, cut)
		.split('/')
		.filter((segment) => segment.length > 0)
		.map((segment) => `${segment}/`);
}

/** The file name, never broken. */
export function baseName(path) {
	return path.slice(path.lastIndexOf('/') + 1);
}
