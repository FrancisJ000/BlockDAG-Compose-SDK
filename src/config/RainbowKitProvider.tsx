import React from 'react';
import "@rainbow-me/rainbowkit/styles.css";
import {getDefaultConfig, RainbowKitProvider} from "@rainbow-me/rainbowkit";
import {WagmiProvider} from "wagmi";
import {QueryClientProvider, QueryClient} from "@tanstack/react-query";
import type {JSX} from "react";
import {mezoTestnet} from "../services/MezoOracleService";

const config = getDefaultConfig({
    appName: "Mezo Compose SDK",
    projectId: "YOUR_PROJECT_ID",
    chains: [mezoTestnet],
    ssr: false,
});

const queryClient = new QueryClient();

type Props = {
    children: React.ReactNode;
};

function RainbowKitConfig(props: Props): JSX.Element {
    const {children} = props;

    return (
        <QueryClientProvider client={queryClient}>
            <WagmiProvider config={config}>
                <RainbowKitProvider>{children}</RainbowKitProvider>
            </WagmiProvider>
        </QueryClientProvider>
    );
}

export default RainbowKitConfig;
