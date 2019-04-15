import * as vscode from 'vscode';
import * as k8s from 'vscode-kubernetes-tools-api';
// import { ContainerServiceClient } from '@azure/arm-containerservice';
import * as azcs from 'azure-arm-containerservice';  // deprecated, but @azure/arm-containerservice doesn't play nicely with AzureAccount, so...
// import * as fs from 'fs';
// import * as path from 'path';
// import * as yaml from 'js-yaml';

import { AKSTreeProvider, AKSClusterTreeNode } from './aks-tree';

const explorer = new AKSTreeProvider();

export async function activate(context: vscode.ExtensionContext) {
    const disposables: vscode.Disposable[] = [
        // vscode.window.registerTreeDataProvider("aks.aksExplorer", explorer),
        // vscode.commands.registerCommand("aks.addToKubeconfig", addToKubeconfig)
    ];

    const cloudExplorer = await k8s.extension.cloudExplorer.v1;
    if (cloudExplorer.available) {
        cloudExplorer.api.registerCloudProvider({
            cloudName: "Azure",
            treeDataProvider: explorer,
            getKubeconfigYaml: (o: AKSClusterTreeNode) => getKubeconfig(o)
        });
    } else {
        vscode.window.showWarningMessage(cloudExplorer.reason);
    }

    context.subscriptions.push(...disposables);
}

async function getKubeconfig(target: AKSClusterTreeNode): Promise<string | undefined> {
    const { resourceGroupName, name } = parseResource(target.armId);
    if (!resourceGroupName || !name) {
        vscode.window.showErrorMessage(`Invalid ARM id ${target.armId}`);
        return;
    }
    const client = new azcs.ContainerServiceClient(target.session.credentials, target.subscription.subscriptionId!);  // TODO: safely
    try {
        const accessProfile = await client.managedClusters.getAccessProfile(resourceGroupName, name, 'clusterUser');
        const kubeconfig = accessProfile.kubeConfig!.toString();  // TODO: safely
        return kubeconfig;
    } catch (e) {
        vscode.window.showErrorMessage(`Can't get kubeconfig: ${e}`);
        return undefined;
    }
}

// async function addToKubeconfig(target: AKSClusterTreeNode): Promise<void> {
//     const kubeconfig = await getKubeconfig(target);
//     if (kubeconfig) {
//         await mergeToKubeconfig(kubeconfig);
//         vscode.window.showInformationMessage(`Added ${target.name} to kubeconfig`);  // TODO: handle it being skipped or whatever we do with duplicates
//     }
// }

function parseResource(armId: string): { resourceGroupName: string | undefined, name: string | undefined } {
    const bits = armId.split('/');
    const resourceGroupName = bitAfter(bits, 'resourceGroups');
    const name = bits[bits.length - 1];
    return { resourceGroupName, name };
}

function bitAfter(bits: string[], after: string): string | undefined {
    const afterIndex = bits.indexOf(after);
    return bits[afterIndex + 1];
}

// interface Named {
//     readonly name: string;
// }

// async function mergeToKubeconfig(newConfig: string): Promise<void> {
//     // strategy: find existing kubeconfig (tricky because it could be merged and we really want to pick one file)
//     // parse its YAML
//     // merge sections: clusters, contexts, users (indexing on name property)
//     // save as YAML

//     const kcfile = path.join((process.env['HOME'] || process.env['USERPROFILE'] || '.'), ".kube", "config");
//     if (!fs.existsSync(kcfile)) {
//         vscode.window.showErrorMessage("Couldn't find kubeconfig file to merge into");
//         return;
//     }

//     const kc = yaml.safeLoad(fs.readFileSync(kcfile, 'utf8'));
//     const nc = yaml.safeLoad(newConfig);

//     for (const section of ['clusters', 'contexts', 'users']) {
//         const existing: Named[] | undefined = kc[section];
//         const toMerge: Named[] | undefined = nc[section];
//         if (!existing) {
//             kc[section] = nc[section];
//             continue;
//         }
//         if (!toMerge) {
//             continue;
//         }
//         mergeInfo(existing, toMerge);
//     }

//     const merged = yaml.safeDump(kc, { lineWidth: 1000000, noArrayIndent: true });
//     const backup = kcfile + '.before-aks-tools';
//     if (fs.existsSync(backup)) {
//         fs.unlinkSync(backup);
//     }
//     fs.renameSync(kcfile, backup);
//     fs.writeFileSync(kcfile, merged);

//     // TODO: should we have an option to 'save in new kubeconfig'?
// }

// function mergeInfo(existing: Named[], toMerge: Named[]): void {
//     for (const toMergeEntry of toMerge) {
//         if (existing.some((e) => e.name === toMergeEntry.name)) {
//             // we have CONFLICT and CONFLICT BUILDS CHARACTER
//             continue;  // TODO: build character
//         }
//         existing.push(toMergeEntry);
//     }
// }
