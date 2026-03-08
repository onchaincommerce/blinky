// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";

contract BlinkMatchEscrow is Ownable {
    using SafeERC20 for IERC20;

    enum MatchStatus {
        None,
        Created,
        Ready,
        Live,
        Resolved,
        Cancelled,
        Refunded
    }

    struct Match {
        address creator;
        address challenger;
        address stakeToken;
        uint256 stakeAmount;
        bytes32 roomIdHash;
        uint64 createdAt;
        uint64 startedAt;
        bytes32 resultHash;
        address winner;
        MatchStatus status;
    }

    error MatchAlreadyExists();
    error MatchDoesNotExist();
    error InvalidStakeAmount();
    error InvalidStatus();
    error Unauthorized();
    error MatchExpired();
    error MatchNotExpired();
    error ChallengerAlreadyJoined();
    error InvalidWinner();

    event MatchCreated(
        uint256 indexed matchId,
        address indexed creator,
        address indexed stakeToken,
        uint256 stakeAmount,
        bytes32 roomIdHash
    );
    event MatchJoined(uint256 indexed matchId, address indexed challenger);
    event MatchStarted(uint256 indexed matchId, uint64 startedAt);
    event MatchResolved(
        uint256 indexed matchId,
        address indexed winner,
        address indexed loser,
        bytes32 resultHash
    );
    event MatchCancelled(uint256 indexed matchId);
    event MatchRefunded(uint256 indexed matchId);
    event RefereeUpdated(address indexed referee);

    mapping(uint256 => Match) private matchesById;

    uint64 public immutable joinExpiry;
    uint64 public immutable noShowExpiry;
    address public referee;

    constructor(address initialOwner, address initialReferee, uint64 joinExpirySeconds, uint64 noShowExpirySeconds)
        Ownable(initialOwner)
    {
        referee = initialReferee;
        joinExpiry = joinExpirySeconds;
        noShowExpiry = noShowExpirySeconds;
    }

    modifier onlyReferee() {
        if (msg.sender != referee) revert Unauthorized();
        _;
    }

    function createMatch(address stakeToken, uint256 stakeAmount, bytes32 roomIdHash) external returns (uint256 matchId) {
        if (stakeAmount == 0) revert InvalidStakeAmount();

        matchId = uint256(roomIdHash);
        Match storage existingMatch = matchesById[matchId];
        if (existingMatch.status != MatchStatus.None) revert MatchAlreadyExists();

        IERC20(stakeToken).safeTransferFrom(msg.sender, address(this), stakeAmount);

        matchesById[matchId] = Match({
            creator: msg.sender,
            challenger: address(0),
            stakeToken: stakeToken,
            stakeAmount: stakeAmount,
            roomIdHash: roomIdHash,
            createdAt: uint64(block.timestamp),
            startedAt: 0,
            resultHash: bytes32(0),
            winner: address(0),
            status: MatchStatus.Created
        });

        emit MatchCreated(matchId, msg.sender, stakeToken, stakeAmount, roomIdHash);
    }

    function joinMatch(uint256 matchId) external {
        Match storage duel = matchesById[matchId];
        if (duel.status != MatchStatus.Created) revert InvalidStatus();
        if (duel.creator == address(0)) revert MatchDoesNotExist();
        if (duel.challenger != address(0)) revert ChallengerAlreadyJoined();
        if (block.timestamp > duel.createdAt + joinExpiry) revert MatchExpired();
        if (msg.sender == duel.creator) revert Unauthorized();

        duel.challenger = msg.sender;
        duel.status = MatchStatus.Ready;

        IERC20(duel.stakeToken).safeTransferFrom(msg.sender, address(this), duel.stakeAmount);

        emit MatchJoined(matchId, msg.sender);
    }

    function startMatch(uint256 matchId) external {
        Match storage duel = matchesById[matchId];
        if (duel.status != MatchStatus.Ready) revert InvalidStatus();
        if (
            msg.sender != duel.creator &&
            msg.sender != duel.challenger &&
            msg.sender != referee
        ) revert Unauthorized();

        duel.status = MatchStatus.Live;
        duel.startedAt = uint64(block.timestamp);

        emit MatchStarted(matchId, duel.startedAt);
    }

    function resolveMatch(uint256 matchId, address winner, bytes32 resultHash) external onlyReferee {
        Match storage duel = matchesById[matchId];
        if (duel.status != MatchStatus.Live) revert InvalidStatus();
        if (winner != duel.creator && winner != duel.challenger) revert InvalidWinner();

        duel.status = MatchStatus.Resolved;
        duel.winner = winner;
        duel.resultHash = resultHash;

        IERC20(duel.stakeToken).safeTransfer(winner, duel.stakeAmount * 2);

        address loser = winner == duel.creator ? duel.challenger : duel.creator;
        emit MatchResolved(matchId, winner, loser, resultHash);
    }

    function cancelExpiredMatch(uint256 matchId) external {
        Match storage duel = matchesById[matchId];
        if (duel.status != MatchStatus.Created) revert InvalidStatus();
        if (block.timestamp <= duel.createdAt + joinExpiry) revert MatchNotExpired();

        duel.status = MatchStatus.Cancelled;
        IERC20(duel.stakeToken).safeTransfer(duel.creator, duel.stakeAmount);

        emit MatchCancelled(matchId);
    }

    function refundNoShow(uint256 matchId) external {
        Match storage duel = matchesById[matchId];
        if (duel.status != MatchStatus.Ready) revert InvalidStatus();
        if (block.timestamp <= duel.createdAt + noShowExpiry) revert MatchNotExpired();

        duel.status = MatchStatus.Refunded;
        IERC20(duel.stakeToken).safeTransfer(duel.creator, duel.stakeAmount);
        IERC20(duel.stakeToken).safeTransfer(duel.challenger, duel.stakeAmount);

        emit MatchRefunded(matchId);
    }

    function setReferee(address newReferee) external onlyOwner {
        referee = newReferee;
        emit RefereeUpdated(newReferee);
    }

    function getMatch(uint256 matchId) external view returns (Match memory) {
        Match memory duel = matchesById[matchId];
        if (duel.status == MatchStatus.None) revert MatchDoesNotExist();
        return duel;
    }
}

