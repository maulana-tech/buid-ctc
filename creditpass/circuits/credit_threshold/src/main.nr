// CreditPass selective disclosure.
//
// Proves: "I hold the secret behind a commitment that sits, together with an address and its score,
// in the registry's Merkle tree at `root`, and that score minus the penalties recorded against my
// nullifier is at least `threshold`." The address and the exact score never leave the browser.
//
// Hashing is circomlib-parameter Poseidon over BN254 so the registry can maintain the same tree
// on chain with poseidon-solidity. Leaf = H(H(address, score), commitment); commitment = H(secret).
// The nullifier is deterministic per identity, so repeat defaults accumulate against it without
// ever linking it back to the address.
use poseidon::poseidon::bn254;

global DEPTH: u32 = 16;
global PENALTY_DEFAULT: u32 = 300;
global NULLIFIER_DOMAIN: Field = 1;

fn main(
    root: pub Field,
    threshold: pub u16,
    nullifier_defaults: pub u8,
    nullifier: pub Field,
    secret: Field,
    address: Field,
    score: u16,
    index: u32,
    siblings: [Field; DEPTH],
) {
    let commitment = bn254::hash_1([secret]);
    let leaf = bn254::hash_2([bn254::hash_2([address, score as Field]), commitment]);

    let mut node = leaf;
    for i in 0..DEPTH {
        let bit = (index >> (i as u8)) & 1;
        let (left, right) = if bit == 0 { (node, siblings[i]) } else { (siblings[i], node) };
        node = bn254::hash_2([left, right]);
    }
    assert(node == root, "leaf is not in the registry tree at this root");

    assert(nullifier == bn254::hash_2([secret, NULLIFIER_DOMAIN]), "nullifier does not match secret");

    let effective = score as u32;
    let required = (threshold as u32) + PENALTY_DEFAULT * (nullifier_defaults as u32);
    assert(effective >= required, "score below threshold after penalties");
}
