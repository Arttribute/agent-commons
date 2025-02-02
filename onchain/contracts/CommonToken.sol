// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";

/**
 * @title CommonToken
 * @notice ERC20 token for the Agent Commons ecosystem.
 */
contract CommonToken is ERC20, AccessControl {
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");
    bytes32 public constant BURNER_ROLE = keccak256("BURNER_ROLE");

    /// @dev 1 ETH = 100000 COMMON$
    uint256 public constant ETH_TO_COMMON_RATE = 100000;

    constructor() ERC20("Common Token", "COMMON$") {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
    }

    /**
     * @dev Mints tokens if caller has MINTER_ROLE.
     */
    function mint(address to, uint256 amount) external onlyRole(MINTER_ROLE) {
        _mint(to, amount);
    }

    /**
     * @dev Burns tokens from `from` if caller has BURNER_ROLE.
     */
    function burn(address from, uint256 amount) external onlyRole(BURNER_ROLE) {
        _burn(from, amount);
    }

    /**
     * @dev When this contract receives ETH, mint CommonToken to sender.
     */
    receive() external payable {
        uint256 tokensToMint = msg.value * ETH_TO_COMMON_RATE;
        _mint(msg.sender, tokensToMint);
    }
}
