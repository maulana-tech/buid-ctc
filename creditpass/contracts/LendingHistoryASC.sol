// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ASCBase} from "@gluwa/asc-contracts/contracts/readability/ASCBase.sol";
import {EvmV1Decoder} from "@gluwa/asc-contracts/contracts/common/EvmV1Decoder.sol";
import {INativeQueryVerifier} from "@gluwa/asc-contracts/contracts/write-ability/common/INativeQueryVerifier.sol";

import {CreditRegistry} from "./CreditRegistry.sol";

/// @title LendingHistoryASC
/// @notice Attestcoin Smart Contract that turns a proved lending-protocol transaction on a source
///         chain into a credit-history entry on Creditcoin.
/// @dev    Protocols are configuration, not code. Aave V3, Spark and Morpho Blue differ only in
///         pool address, event signature, and which topic carries the borrower — so they are stored
///         as data and a new protocol is a transaction, not a redeploy.
///
///         Compound V3 is deliberately absent: repaying in Comet is a `Supply` of the base asset,
///         indistinguishable from an ordinary supply without reading debt state. Guessing there
///         would mint credit history for people who never borrowed.
contract LendingHistoryASC is ASCBase {
    enum Action {
        Repay, // 0
        Liquidation, // 1
        Borrow // 2
    }

    uint256 private constant ACTION_COUNT = 3;

    /// @param topic0 keccak of the event signature as emitted by this protocol.
    /// @param borrowerTopic Index into `topics[]` holding the address whose record this is.
    /// @param enabled Whether proofs for this (protocol, action) pair are accepted.
    struct EventSpec {
        bytes32 topic0;
        uint8 borrowerTopic;
        bool enabled;
    }

    struct Source {
        address pool;
        uint64 chainKey;
        bool enabled;
        string name;
    }

    CreditRegistry public immutable REGISTRY;

    address public owner;

    mapping(uint16 => Source) public sources;
    mapping(uint16 => mapping(uint8 => EventSpec)) public eventSpecs;
    uint16[] private _registeredIds;

    /// @dev Proof context for the in-flight `execute` call. ASCBase forwards neither chainKey nor
    ///      blockHeight to `_processAndEmitEvent`, and both are needed: the chain key to pin the
    ///      source chain, the height to timestamp the entry. `submit` stashes them, `execute`
    ///      re-enters via `this.`, and the handler reads them back. Calling `execute` directly
    ///      finds an empty context and reverts.
    uint64 private _ctxChainKey;
    uint64 private _ctxHeight;
    uint16 private _ctxProtocolId;

    event SourceRegistered(uint16 indexed protocolId, string name, address pool, uint64 chainKey);
    event SourceEnabled(uint16 indexed protocolId, bool enabled);
    event EventSpecSet(uint16 indexed protocolId, uint8 action, bytes32 topic0, uint8 borrowerTopic);
    event HistoryProved(address indexed user, uint16 protocolId, Action action, uint64 sourceBlock, bytes32 queryId);
    event OwnershipTransferred(address indexed from, address indexed to);

    error NotOwner();
    error ZeroAddress();
    error UnknownProtocol(uint16 protocolId);
    error ProtocolDisabled(uint16 protocolId);
    error ActionNotConfigured(uint16 protocolId, uint8 action);
    error WrongSourceChain(uint64 given, uint64 expected);
    error MustCallSubmit();
    error UnknownAction(uint8 action);
    error WrongEmitter(address emitter, address expected);
    error TransactionFailed();
    error UnsupportedTransactionType(uint8 txType);
    error NoMatchingEvent();
    error MalformedLog();

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    constructor(CreditRegistry registry_) {
        if (address(registry_) == address(0)) revert ZeroAddress();
        REGISTRY = registry_;
        owner = msg.sender;
        emit OwnershipTransferred(address(0), msg.sender);
    }

    function transferOwnership(address to) external onlyOwner {
        if (to == address(0)) revert ZeroAddress();
        emit OwnershipTransferred(owner, to);
        owner = to;
    }

    // --------------------------------------------------------- configuration

    /// @notice Register a lending protocol on a source chain.
    /// @dev protocolId must stay below 32 — CreditRegistry stores it in a bitmask.
    function registerSource(uint16 protocolId, string calldata name, address pool, uint64 chainKey) external onlyOwner {
        if (pool == address(0)) revert ZeroAddress();
        if (chainKey == 0) revert UnknownProtocol(protocolId);

        if (sources[protocolId].pool == address(0)) _registeredIds.push(protocolId);
        sources[protocolId] = Source({pool: pool, chainKey: chainKey, enabled: true, name: name});

        emit SourceRegistered(protocolId, name, pool, chainKey);
    }

    function setSourceEnabled(uint16 protocolId, bool enabled) external onlyOwner {
        if (sources[protocolId].pool == address(0)) revert UnknownProtocol(protocolId);
        sources[protocolId].enabled = enabled;
        emit SourceEnabled(protocolId, enabled);
    }

    /// @notice Describe one event of one protocol: its topic0 and which topic holds the borrower.
    function setEventSpec(uint16 protocolId, Action action, bytes32 topic0, uint8 borrowerTopic) external onlyOwner {
        if (sources[protocolId].pool == address(0)) revert UnknownProtocol(protocolId);
        // Topic 0 is the signature itself, and a log carries at most four topics.
        if (borrowerTopic == 0 || borrowerTopic > 3) revert MalformedLog();

        eventSpecs[protocolId][uint8(action)] = EventSpec({topic0: topic0, borrowerTopic: borrowerTopic, enabled: true});
        emit EventSpecSet(protocolId, uint8(action), topic0, borrowerTopic);
    }

    function registeredProtocolIds() external view returns (uint16[] memory) {
        return _registeredIds;
    }

    // -------------------------------------------------------------- submission

    /// @notice Submit an Attestcoin proof of a lending-protocol transaction. Permissionless:
    ///         authority comes from the proof, not the sender.
    function submit(
        uint16 protocolId,
        Action action,
        uint64 chainKey,
        uint64 blockHeight,
        bytes calldata encodedTransaction,
        bytes32 merkleRoot,
        INativeQueryVerifier.MerkleProofEntry[] calldata siblings,
        bytes32 lowerEndpointDigest,
        bytes32[] calldata continuityRoots
    ) external {
        Source memory source = sources[protocolId];
        if (source.pool == address(0)) revert UnknownProtocol(protocolId);
        if (!source.enabled) revert ProtocolDisabled(protocolId);
        if (chainKey != source.chainKey) revert WrongSourceChain(chainKey, source.chainKey);
        if (!eventSpecs[protocolId][uint8(action)].enabled) revert ActionNotConfigured(protocolId, uint8(action));

        _ctxChainKey = chainKey;
        _ctxHeight = blockHeight;
        _ctxProtocolId = protocolId;

        this.execute(
            uint8(action),
            chainKey,
            blockHeight,
            encodedTransaction,
            merkleRoot,
            siblings,
            lowerEndpointDigest,
            continuityRoots
        );

        _ctxChainKey = 0;
        _ctxHeight = 0;
        _ctxProtocolId = 0;
    }

    // ---------------------------------------------------------------- handler

    function _processAndEmitEvent(uint8 action, bytes32 queryId, bytes memory encodedTransaction) internal override {
        if (_ctxChainKey == 0) revert MustCallSubmit();
        if (action >= ACTION_COUNT) revert UnknownAction(action);

        uint16 protocolId = _ctxProtocolId;
        uint64 sourceBlock = _ctxHeight;

        address user = _borrowerFrom(protocolId, action, encodedTransaction);

        if (action == uint8(Action.Repay)) {
            REGISTRY.recordRepayment(user, protocolId, sourceBlock);
        } else if (action == uint8(Action.Liquidation)) {
            REGISTRY.recordLiquidation(user, protocolId, sourceBlock);
        } else {
            REGISTRY.recordBorrow(user, protocolId, sourceBlock);
        }

        emit HistoryProved(user, protocolId, Action(action), sourceBlock, queryId);
    }

    /// @dev Decode the proved transaction, require it succeeded, find the protocol's event, check
    ///      the emitter, and pull the borrower out of the configured topic.
    function _borrowerFrom(uint16 protocolId, uint8 action, bytes memory encodedTransaction) internal view returns (address) {
        EventSpec memory spec = eventSpecs[protocolId][action];

        uint8 txType = EvmV1Decoder.getTransactionType(encodedTransaction);
        if (!EvmV1Decoder.isValidTransactionType(txType)) revert UnsupportedTransactionType(txType);

        EvmV1Decoder.ReceiptFields memory receipt = EvmV1Decoder.decodeReceiptFields(encodedTransaction);
        // A reverted transaction is still included in a block and its proof still verifies.
        // Without this, a failed repayment would count as a successful one.
        if (receipt.receiptStatus != 1) revert TransactionFailed();

        EvmV1Decoder.LogEntry[] memory logs = EvmV1Decoder.getLogsByEventSignature(receipt, spec.topic0);
        if (logs.length == 0) revert NoMatchingEvent();

        return _borrowerFromLogs(logs, sources[protocolId].pool, spec);
    }

    // ponytail: only the first matching log per transaction is scored. A batched transaction
    // repaying several positions counts once. Loop over `logs` if batch repayers show up in the data.
    function _borrowerFromLogs(EvmV1Decoder.LogEntry[] memory logs, address pool, EventSpec memory spec)
        internal
        pure
        returns (address)
    {
        EvmV1Decoder.LogEntry memory log = logs[0];

        // The one check standing between this contract and forged history: anyone can deploy a
        // contract that emits a perfectly-shaped Repay event naming someone else's address.
        if (log.address_ != pool) revert WrongEmitter(log.address_, pool);
        if (log.topics.length <= spec.borrowerTopic) revert MalformedLog();

        return address(uint160(uint256(log.topics[spec.borrowerTopic])));
    }
}
