import { log, store, BigInt } from "@graphprotocol/graph-ts";
import {
  ERC721,
  Transfer as TransferEvent,
  NewEpochScheduled as NewEpochScheduledEvent,
  FulfillEpochRevealed as FulfillEpochRevealedEvent,
  RevealRequested as RevealRequestedEvent
} from "../generated/BondingCurveMons/ERC721";
import {
  Token,
  Wallet,
  Contract,
  Transfer,
  Epoch,
  EpochCounter,
  Transaction
} from "../generated/schema";

export function handleTransfer(event: TransferEvent): void {
  log.debug("Transfer detected. From: {} | To: {} | TokenID: {}", [
    event.params.from.toHexString(),
    event.params.to.toHexString(),
    event.params.tokenId.toHexString()
  ]);

  let previousOwner = Wallet.load(event.params.from.toHexString());
  let newOwner = Wallet.load(event.params.to.toHexString());
  let token = Token.load(event.params.tokenId.toHexString());
  let transferId = event.transaction.hash
    .toHexString()
    .concat(":".concat(event.transactionLogIndex.toHexString()));
  let transfer = Transfer.load(transferId);
  let contract = Contract.load(event.address.toHexString());
  let instance = ERC721.bind(event.address);

  if (previousOwner == null) {
    previousOwner = new Wallet(event.params.from.toHexString());
  }

  if (newOwner == null) {
    newOwner = new Wallet(event.params.to.toHexString());
  }

  if (token == null) {
    token = new Token(event.params.tokenId.toHexString());
    token.contract = event.address.toHexString();
    token.minter = event.params.to.toHexString();
    let uri = instance.try_tokenURI(event.params.tokenId);

    if (!uri.reverted) {
      token.uri = uri.value;
    }
  }
  token.owner = event.params.to.toHexString();

  if (transfer == null) {
    transfer = new Transfer(transferId);
    transfer.token = event.params.tokenId.toHexString();
    transfer.from = event.params.from.toHexString();
    transfer.to = event.params.to.toHexString();
    transfer.timestamp = event.block.timestamp;
    transfer.block = event.block.number;
    transfer.transactionHash = event.transaction.hash.toHexString();
  }

  if (contract == null) {
    contract = new Contract(event.address.toHexString());
  }

  let name = instance.try_name();
  if (!name.reverted) {
    contract.name = name.value;
  }

  let symbol = instance.try_symbol();
  if (!symbol.reverted) {
    contract.symbol = symbol.value;
  }

  let totalSupply = instance.try_totalSupply();
  if (!totalSupply.reverted) {
    contract.totalSupply = totalSupply.value;
  }

  previousOwner.save();
  newOwner.save();
  token.save();
  contract.save();
  transfer.save();

  // generate a new Transaction entity
  let transaction = new Transaction(event.transaction.hash.toHexString());

  transaction.save();
}

export function handleNewEpochScheduled(event: NewEpochScheduledEvent): void {
  // Use a constant ID for the EpochCounter since there will only be one instance.
  let counterId = 'epoch-counter';
  let epochCounter = EpochCounter.load(counterId);

  if (epochCounter == null) {
    epochCounter = new EpochCounter(counterId);
    epochCounter.count = BigInt.fromI32(0); // Initialize the count
  }

  // Increment the count
  epochCounter.count = epochCounter.count.plus(BigInt.fromI32(1));
  epochCounter.save();

  // Now, create a new epoch entity using the incremented count
  let epoch = new Epoch(event.params.timestamp.toHexString());
  epoch.number = epochCounter.count;
  epoch.startBlock = event.block.number;
  epoch.timestamp = event.params.timestamp;
  epoch.save();

  // Generate a new Transaction entity
  let transaction = new Transaction(event.transaction.hash.toHexString());
  transaction.save();
}

export function handleFulfillEpochRevealed(
  event: FulfillEpochRevealedEvent
): void {
  // we fetch the epoch entity
  let epoch = Epoch.load(event.params.timestamp.toHexString());

  if (epoch == null) {
    log.debug("Epoch not found: {}", [event.params.timestamp.toHexString()]);
    return;
  }

  epoch.endBlock = event.block.number;
  epoch.randomness = event.params.randomness;
  epoch.save();

  // generate a new Transaction entity
  let transaction = new Transaction(event.transaction.hash.toHexString());

  transaction.save();
}

export function handleRevealRequested(event: RevealRequestedEvent): void {
  // we fetch the epoch entity
  let epoch = Epoch.load(event.params.nextRevealTimestamp.toHexString());

  if (epoch == null) {
    log.debug("Epoch not found: {}", [
      event.params.nextRevealTimestamp.toHexString()
    ]);
    return;
  }

  // and we add it to the Token entity
  let token = Token.load(event.params.tokenId.toHexString());
  if (token == null) {
    log.debug("Token not found: {}", [event.params.tokenId.toHexString()]);
    return;
  }
  token.epoch = epoch.id;
  token.save();

  // generate a new Transaction entity
  let transaction = new Transaction(event.transaction.hash.toHexString());
  transaction.save();
}
