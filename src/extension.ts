import * as vscode from "vscode";

const DEFAULT_FLASH_DURATION = 100; // ms
const DEFAULT_DARK = "Default Dark+";
const DEFAULT_LIGHT = "Default Light+";

// global vars :sob:
let originalTheme: string | undefined;
let flashingInterval: NodeJS.Timeout | undefined;
let isLightTheme = true;

export function activate(context: vscode.ExtensionContext) {
    context.subscriptions.push(
        vscode.commands.registerCommand(
            "flashbang.setLightTheme",
            setLightTheme
        )
    );
    context.subscriptions.push(
        vscode.commands.registerCommand(
            "flashbang.setFlashDuration",
            setFlashDuration
        )
    );

    vscode.window.onDidChangeActiveTextEditor((editor) => {
        if (editor) {
            watchDiagnosticsForEditor(editor.document.uri);
        }
    });

    // Check diagnostics for the initial open file (if any)
    if (vscode.window.activeTextEditor) {
        watchDiagnosticsForEditor(vscode.window.activeTextEditor.document.uri);
    }
}

export function deactivate() {
    if (flashingInterval) {
        clearInterval(flashingInterval);
        flashingInterval = undefined;
    }
}

function watchDiagnosticsForEditor(uri: vscode.Uri) {
    // check the error count in the active file
    vscode.languages.onDidChangeDiagnostics((diagnosticChange) => {
        const diagnosticUri = diagnosticChange.uris.find(
            (u) => u.toString() === uri.toString()
        );
        if (!diagnosticUri) {
            return;
        }

        const diagnostics = vscode.languages.getDiagnostics(diagnosticUri);
        const hasError = diagnostics.some(
            (d) => d.severity === vscode.DiagnosticSeverity.Error
        );

        if (hasError) {
            startFlashing();
        } else {
            stopFlashingAndRestoreTheme();
        }
    });
}

async function startFlashing() {
    if (flashingInterval) {
        return;
    }

    const config = vscode.workspace.getConfiguration("workbench");
    const flashbangConfig = vscode.workspace.getConfiguration("flashbang");

    const lightTheme =
        flashbangConfig.get<string>("lightTheme") || DEFAULT_LIGHT;
    const flashDuration =
        flashbangConfig.get<number>("flashDuration") || DEFAULT_FLASH_DURATION;

    if (!originalTheme) {
        vscode.window.showInformationMessage("Fix the errors to fix your eyes");
        // Save the current theme only the first time the ext detects errors
        originalTheme = config.get<string>("colorTheme");
    }

    flashingInterval = setInterval(async () => {
        const darkTheme = originalTheme || DEFAULT_DARK;
        const newTheme = isLightTheme ? lightTheme : darkTheme;

        await config.update(
            "colorTheme",
            newTheme,
            vscode.ConfigurationTarget.Global
        );

        isLightTheme = !isLightTheme; // flip the var
    }, flashDuration);
}

async function stopFlashingAndRestoreTheme() {
    deactivate();

    if (!originalTheme) {
        return;
    }

    const config = vscode.workspace.getConfiguration("workbench");
    await config.update(
        "colorTheme",
        originalTheme,
        vscode.ConfigurationTarget.Global
    );

    originalTheme = undefined; // Clear the original theme after restoring
}

async function setLightTheme() {
    if (flashingInterval) {
        return vscode.window.showInformationMessage("Can't Set When Flashing");
    }

    const extensions = vscode.extensions.all;
    const lightThemes = [];

    for (const ext of extensions) {
        const contributes = ext.packageJSON.contributes;

        if (contributes && contributes.themes) {
            for (const theme of contributes.themes) {
                if (theme.uiTheme === "vs") {
                    // vs means its a light mode theme, dark themes are vs-dark
                    lightThemes.push(theme.label);
                }
            }
        }
    }

    const theme = await vscode.window.showQuickPick(lightThemes, {
        placeHolder: "Select your preferred light theme",
    });

    if (!theme) {
        return;
    }

    const config = vscode.workspace.getConfiguration();
    await config.update(
        "flashbang.lightTheme",
        theme,
        vscode.ConfigurationTarget.Global
    );

    vscode.window.showInformationMessage(`Light theme set to ${theme}`);
}

async function setFlashDuration() {
    if (flashingInterval) {
        return vscode.window.showInformationMessage("Can't Set When Flashing");
    }

    const duration = await vscode.window.showInputBox({
        placeHolder: "100",
        title: "Enter Flash Duration",
        validateInput(value) {
            if (isNaN(parseInt(value))) {
                return value;
            }
        },
    });

    const config = vscode.workspace.getConfiguration();
    await config.update(
        "flashbang.flashDuration",
        parseInt(duration || "100"),
        vscode.ConfigurationTarget.Global
    );

    vscode.window.showInformationMessage(`Flash Duration set to ${duration}`);
}
