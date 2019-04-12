import * as vscode from 'vscode';
// import { ContainerServiceClient } from '@azure/arm-containerservice';
import * as azcs from 'azure-arm-containerservice';  // deprecated, but @azure/arm-containerservice doesn't play nicely with AzureAccount, so...

import { AKSTreeProvider, AKSClusterTreeNode } from './aks-tree';

const explorer = new AKSTreeProvider();

export function activate(context: vscode.ExtensionContext) {
    const disposables = [
        vscode.window.registerTreeDataProvider("aks.aksExplorer", explorer),
        vscode.commands.registerCommand("aks.addToKubeconfig", addToKubeconfig)
    ];

    context.subscriptions.push(...disposables);
}

async function addToKubeconfig(target: AKSClusterTreeNode): Promise<void> {
    const { resourceGroupName, name } = parseResource(target.armId);
    if (!resourceGroupName || !name) {
        vscode.window.showErrorMessage(`Invalid ARM id ${target.armId}`);
        return;
    }
    const client = new azcs.ContainerServiceClient(target.session.credentials, target.subscription.subscriptionId!);  // TODO: safely
    try {
        const accessProfile = await client.managedClusters.getAccessProfile(resourceGroupName, name, 'clusterUser');
        const kubeconfig = accessProfile.kubeConfig!.toString();  // TODO: safely
        console.log(kubeconfig);
    } catch (e) {
        console.log(e);
    }
}

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
