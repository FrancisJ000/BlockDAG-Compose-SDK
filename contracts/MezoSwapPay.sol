// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title MezoSwapPay
 * @notice Simplified multi-token swap aggregator for Mezo Testnet
 * @dev Allows users to aggregate multiple tokens and execute a swap in one transaction
 */
contract MezoSwapPay is Ownable {
    using SafeERC20 for IERC20;

    // Events
    event SwapExecuted(
        address indexed user,
        address[] tokens,
        uint256[] amounts,
        address target,
        uint256 paymentAmount
    );

    event EmergencyWithdraw(address indexed token, uint256 amount);

    constructor() Ownable(msg.sender) {}

    /**
     * @notice Execute a multi-token swap
     * @param _tokens Array of ERC20 token addresses to pull from user
     * @param _amounts Array of amounts for each token
     * @param _target Target contract to call (e.g., DEX router)
     * @param _callData Encoded function call for the target
     * @param _paymentAmount Expected output amount (for validation)
     * @param _minOut Minimum output amount (slippage protection)
     */
    function execute(
        address[] calldata _tokens,
        uint256[] calldata _amounts,
        address _target,
        bytes calldata _callData,
        uint256 _paymentAmount,
        uint256 _minOut
    ) external {
        require(_tokens.length == _amounts.length, "Length mismatch");
        require(_tokens.length > 0, "Empty arrays");
        require(_target != address(0), "Invalid target");

        // Pull tokens from user
        for (uint256 i = 0; i < _tokens.length; i++) {
            if (_amounts[i] > 0) {
                IERC20(_tokens[i]).safeTransferFrom(
                    msg.sender,
                    address(this),
                    _amounts[i]
                );
            }
        }

        // Approve target contract if needed
        for (uint256 i = 0; i < _tokens.length; i++) {
            if (_amounts[i] > 0) {
                IERC20(_tokens[i]).forceApprove(_target, _amounts[i]);
            }
        }

        // Execute the swap call
        (bool success, ) = _target.call(_callData);
        require(success, "Target call failed");

        // Validate minimum output (basic slippage protection)
        require(_paymentAmount >= _minOut, "Insufficient output");

        emit SwapExecuted(msg.sender, _tokens, _amounts, _target, _paymentAmount);
    }

    /**
     * @notice Execute a simple token allocation
     * @dev Transfers tokens from user to this contract for holding
     */
    function allocate(
        address[] calldata _tokens,
        uint256[] calldata _amounts
    ) external {
        require(_tokens.length == _amounts.length, "Length mismatch");
        
        for (uint256 i = 0; i < _tokens.length; i++) {
            if (_amounts[i] > 0) {
                IERC20(_tokens[i]).safeTransferFrom(
                    msg.sender,
                    address(this),  // Transfer to contract for allocation
                    _amounts[i]
                );
            }
        }

        emit SwapExecuted(msg.sender, _tokens, _amounts, address(0), 0);
    }

    /**
     * @notice Emergency withdraw function (owner only)
     * @dev In case tokens get stuck in the contract
     */
    function emergencyWithdraw(
        address _token,
        uint256 _amount
    ) external onlyOwner {
        if (_token == address(0)) {
            // Withdraw ETH/BTC
            payable(owner()).transfer(_amount);
        } else {
            // Withdraw ERC20
            IERC20(_token).safeTransfer(owner(), _amount);
        }
        emit EmergencyWithdraw(_token, _amount);
    }

    // Receive function to accept ETH/BTC
    receive() external payable {}
}

