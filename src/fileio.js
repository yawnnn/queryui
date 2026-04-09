function getExtension(fileName) {
    const index = fileName.lastIndexOf(".");
    return index >= 0 ? fileName.slice(index) : "";
}

function isAbortError(error) {
    return error?.name === "AbortError";
}

function saveFileFallback(fileName, contents, type) {
    const blob = new Blob([contents], { type });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = fileName;
    link.click();

    URL.revokeObjectURL(url);
}

async function saveFilePicker(fileName, contents, type) {
    const ext = getExtension(fileName);
    const accept = { [type]: [ext] };

    const handle = await window.showSaveFilePicker({
        suggestedName: fileName,
        types: [{ accept }],
    });

    const writable = await handle.createWritable();
    await writable.write(contents);
    await writable.close();
}

export async function saveFile(fileName, contents, type) {
    try {
        if (window.showSaveFilePicker) {
            await saveFilePicker(fileName, contents, type);
            return;
        }

        saveFileFallback(fileName, contents, type);
    } catch (error) {
        if (!isAbortError(error))
            throw error;
    }
}

function loadFileFallback(type) {
    return new Promise((resolve, reject) => {
        const input = document.createElement("input");
        input.type = "file";
        input.accept = type;

        input.onchange = async (event) => {
            const file = event.target.files?.[0];
            if (!file) {
                resolve(null);
                return;
            }

            try {
                resolve(await file.text());
            } catch (error) {
                reject(error);
            }
        };

        input.click();
    });
}

async function loadFilePicker(fileName, type) {
    const ext = getExtension(fileName);
    const accept = { [type]: [ext] };

    const [handle] = await window.showOpenFilePicker({
        multiple: false,
        types: [{ accept }],
    });

    const file = await handle.getFile();
    return file.text();
}

export async function loadFile(fileName, type) {
    try {
        if (window.showOpenFilePicker)
            return await loadFilePicker(fileName, type);

        return await loadFileFallback(type);
    } catch (error) {
        if (isAbortError(error))
            return null;

        throw error;
    }
}