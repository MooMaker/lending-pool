// SPDX-License-Identifier: AGPLv3
pragma solidity ^0.8.18;

// ChainLink mock aggregator
contract CLMockAggregator {
    int256 private _latestAnswer;

    event AnswerUpdated(
        int256 indexed current,
        uint256 indexed roundId,
        uint256 timestamp
    );

    constructor(int256 _initialAnswer) public {
        _latestAnswer = _initialAnswer;
        emit AnswerUpdated(_initialAnswer, 0, block.timestamp);
    }

    function latestAnswer() external view returns (int256) {
        return _latestAnswer;
    }
}
