
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

contract RoqLockEscrow is Ownable, ReentrancyGuard, Pausable {
    using SafeERC20 for IERC20;

    enum Status {
        None,
        Funded,
        Disputed,
        Released,
        Resolved
    }

    struct Escrow {
        bytes32 dealId;
        address buyer;
        address seller;
        uint256 amount;
        uint256 createdAt;
        Status status;
    }

    IERC20 public immutable usdc;
    address public arbitrator;

    mapping(bytes32 => Escrow) public escrows;

    event EscrowCreated(
        bytes32 indexed dealId,
        address indexed buyer,
        address indexed seller,
        uint256 amount
    );

    event DisputeRaised(
        bytes32 indexed dealId,
        address indexed raisedBy
    );

    event FundsReleased(
        bytes32 indexed dealId,
        address indexed seller,
        uint256 amount
    );

    event DisputeResolved(
        bytes32 indexed dealId,
        uint256 buyerAmount,
        uint256 sellerAmount
    );

    event ArbitratorUpdated(
        address indexed oldArbitrator,
        address indexed newArbitrator
    );

    modifier onlyArbitrator() {
        require(msg.sender == arbitrator, "Not arbitrator");
        _;
    }

    constructor(
        address usdcAddress,
        address initialOwner,
        address initialArbitrator
    ) Ownable(initialOwner) {
        require(usdcAddress != address(0), "Invalid USDC");
        require(initialArbitrator != address(0), "Invalid arbitrator");

        usdc = IERC20(usdcAddress);
        arbitrator = initialArbitrator;
    }

    // Buyer approves USDC first, then calls this function.
    function createAndFundEscrow(
        bytes32 dealId,
        address seller,
        uint256 amount
    ) external nonReentrant whenNotPaused {
        require(dealId != bytes32(0), "Invalid deal ID");
        require(escrows[dealId].status == Status.None, "Deal exists");
        require(seller != address(0), "Invalid seller");
        require(seller != msg.sender, "Buyer cannot be seller");
        require(amount > 0, "Amount must be positive");

        // Lock USDC in this contract.
        usdc.safeTransferFrom(msg.sender, address(this), amount);

        escrows[dealId] = Escrow({
            dealId: dealId,
            buyer: msg.sender,
            seller: seller,
            amount: amount,
            createdAt: block.timestamp,
            status: Status.Funded
        });

        emit EscrowCreated(dealId, msg.sender, seller, amount);
    }

    // Only the buyer can approve normal release.
    function releaseFunds(
        bytes32 dealId
    ) external nonReentrant whenNotPaused {
        Escrow storage escrow = escrows[dealId];

        require(escrow.status == Status.Funded, "Not funded");
        require(msg.sender == escrow.buyer, "Only buyer");

        escrow.status = Status.Released;

        usdc.safeTransfer(escrow.seller, escrow.amount);

        emit FundsReleased(
            dealId,
            escrow.seller,
            escrow.amount
        );
    }

    // Buyer or seller can raise a dispute.
    function raiseDispute(
        bytes32 dealId
    ) external whenNotPaused {
        Escrow storage escrow = escrows[dealId];

        require(escrow.status == Status.Funded, "Not available");
        require(
            msg.sender == escrow.buyer ||
            msg.sender == escrow.seller,
            "Not a deal party"
        );

        escrow.status = Status.Disputed;

        emit DisputeRaised(dealId, msg.sender);
    }

    // Arbitrator decides how the locked funds are distributed.
    function resolveDispute(
        bytes32 dealId,
        uint256 buyerAmount,
        uint256 sellerAmount
    ) external onlyArbitrator nonReentrant whenNotPaused {
        Escrow storage escrow = escrows[dealId];

        require(escrow.status == Status.Disputed, "Not disputed");
        require(
            buyerAmount + sellerAmount == escrow.amount,
            "Amounts must equal escrow"
        );

        // Update state before transferring funds.
        escrow.status = Status.Resolved;

        if (buyerAmount > 0) {
            usdc.safeTransfer(escrow.buyer, buyerAmount);
        }

        if (sellerAmount > 0) {
            usdc.safeTransfer(escrow.seller, sellerAmount);
        }

        emit DisputeResolved(
            dealId,
            buyerAmount,
            sellerAmount
        );
    }

    function setArbitrator(
        address newArbitrator
    ) external onlyOwner {
        require(newArbitrator != address(0), "Invalid arbitrator");

        address oldArbitrator = arbitrator;
        arbitrator = newArbitrator;

        emit ArbitratorUpdated(oldArbitrator, newArbitrator);
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    function getEscrow(
        bytes32 dealId
    ) external view returns (Escrow memory) {
        return escrows[dealId];
    }
}
