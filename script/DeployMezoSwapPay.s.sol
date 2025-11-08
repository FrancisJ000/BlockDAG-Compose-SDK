// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../contracts/MezoSwapPay.sol";

contract DeployMezoSwapPay is Script {
    function run() external {
        // Get private key from environment (expects 0x prefix)
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        
        console.log("Deploying from address:", vm.addr(deployerPrivateKey));
        
        vm.startBroadcast(deployerPrivateKey);

        MezoSwapPay swapPay = new MezoSwapPay();
        
        console.log("MezoSwapPay deployed to:", address(swapPay));
        console.log("Owner:", swapPay.owner());

        vm.stopBroadcast();
    }
}

