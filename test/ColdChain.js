const { expectEvent, BN } = require('@openzeppelin/test-helpers');
const ColdChain = artifacts.require("ColdChain");
const HDWalletProvider = require('@truffle/hdwallet-provider');
const Web3 = require('web3');

contract('ColdChain', (accounts) => {

  before(async () => {

    this.owner = accounts[0];

    this.VACCINE_BRANDS = {
      Pfizer: "Pfizer-BioNTech",
      Moderna: "Moderna",
      Janssen: "Johnson & Johnson's Janssen",
      Sputnik: "Sputnik V"
    };

    this.ModeEnums = {
      ISSUER: { val: "ISSUER", pos: 0 },
      PROVER: { val: "PROVER", pos: 1 },
      VERIFIER: { val: "VERIFIER", pos: 2 },
    };

    this.statusEnums = {
      manufactored: { val: "MANUFACTORED", pos: 0 },
      delivering1: { val: "DELIVERING_INTERNATIONAL", pos: 1 },
      stored: { val: "STORED", pos: 2 },
      delivering2: { val: "DELIVERING_LOCAL", pos: 3 },
      delivered: { val: "DELIVERED", pos: 4 },
    };

    this.defaultEntities = {
      manfacturerA: { id: accounts[1], mode: this.ModeEnums.PROVER.val },
      manfacturerB: { id: accounts[2], mode: this.ModeEnums.PROVER.val },
      inspector: { id: accounts[3], mode: this.ModeEnums.ISSUER.val },
      distributorGlobal: { id: accounts[4], mode: this.ModeEnums.VERIFIER.val },
      distributorLocal: { id: accounts[5], mode: this.ModeEnums.VERIFIER.val },
      immunizer: { id: accounts[6], mode: this.ModeEnums.ISSUER.val },
      traveller: { id: accounts[7], mode: this.ModeEnums.PROVER.val },
      borderAgent: { id: accounts[8], mode: this.ModeEnums.VERIFIER.val }
    };

    this.defaultVaccineBatches = {
      0: { brand: this.VACCINE_BRANDS.Pfizer, manufacturer: this.defaultEntities.manfacturerA.id },
      1: { brand: this.VACCINE_BRANDS.Moderna, manufacturer: this.defaultEntities.manfacturerA.id },
      2: { brand: this.VACCINE_BRANDS.Janssen, manufacturer: this.defaultEntities.manfacturerB.id },
      3: { brand: this.VACCINE_BRANDS.Sputnik, manufacturer: this.defaultEntities.manfacturerB.id },
      4: { brand: this.VACCINE_BRANDS.Pfizer, manufacturer: this.defaultEntities.manfacturerB.id },
      5: { brand: this.VACCINE_BRANDS.Pfizer, manufacturer: this.defaultEntities.manfacturerA.id },
      6: { brand: this.VACCINE_BRANDS.Moderna, manufacturer: this.defaultEntities.manfacturerA.id },
      7: { brand: this.VACCINE_BRANDS.Moderna, manufacturer: this.defaultEntities.manfacturerB.id },
      8: { brand: this.VACCINE_BRANDS.Sputnik, manufacturer: this.defaultEntities.manfacturerB.id },
      9: { brand: this.VACCINE_BRANDS.Janssen, manufacturer: this.defaultEntities.manfacturerA.id }
    };

    this.coldChainInstance = await ColdChain.deployed();

  });

  it('should add entities', async () => {

    for (const entity in this.defaultEntities) {
      const { id, mode } = this.defaultEntities[entity];
      const result = await this.coldChainInstance.addEntity(
        id,
        mode,
        { from: this.owner }
      );

      expectEvent(result.receipt, "AddEntity", {
        entityId: id,
        entityMode: mode
      });

      const retrievedEntity = await this.coldChainInstance.entities.call(id)
      assert.equal(id, retrievedEntity.id, "mismatched ids");
      assert.equal(this.ModeEnums[mode].pos, retrievedEntity.mode.toString(), "mismatched modes");
    }
  });

  it('should add vaccine Batches', async () => {

    for (let i = 0; i < Object.keys(this.defaultVaccineBatches).length; i++) {
      const { brand, manufacturer } = this.defaultVaccineBatches[i];
      const result = await this.coldChainInstance.addVaccineBatch(
        brand,
        manufacturer,
        { from: this.owner }
      );

      expectEvent(result.receipt, "AddVaccineBatch", {
        vaccineBatchId: String(i),
        manufacturer: manufacturer
      });

      const retrievedvaccineBatch = await this.coldChainInstance.vaccineBatches.call(i)
      assert.equal(i, retrievedvaccineBatch.id);
      assert.equal(brand, retrievedvaccineBatch.brand);
      assert.equal(manufacturer, retrievedvaccineBatch.manufacturer);
      assert.equal(undefined, retrievedvaccineBatch.certificateIds);
    }

  });

  it('should sign a message & store it as a certificate from issuer to prover', async () => {

    const mnemonic = "tip dismiss thrive biology remain bottom credit damage intact trust gown van";
    const providerOrURL = "http://localhost:8545";
    const provider = new HDWalletProvider(
      mnemonic,
      providerOrURL
    );

    this.web3 = new Web3(provider);

    const { inspector, manfacturerA } = this.defaultEntities;
    const vaccineBatchId = 0;
    const message = `Inspector (${inspector.id}) has certified vaccine batch #${vaccineBatchId} for 
    manufacturer (${manfacturerA.id}).`;

    const signature = await this.web3.eth.sign(
      this.web3.utils.keccak256(message),
      inspector.id
    );

    const result = await this.coldChainInstance.IssueCertificate(
      inspector.id,
      manfacturerA.id,
      this.statusEnums.manufactored.val,
      vaccineBatchId,
      signature,
      { from: this.owner });

    expectEvent(result.receipt, "IssueCertificate", {
      issuer: inspector.id,
      prover: manfacturerA.id,
      certificateId: new BN(0)
    });

    const retrievedCertificate = await this.coldChainInstance.certificates.call(0);

    assert.equal(retrievedCertificate.id, 0);
    assert.equal(retrievedCertificate.issuer["id"], inspector.id);
    assert.equal(retrievedCertificate.prover["id"], manfacturerA.id);
    assert.equal(retrievedCertificate.signature, signature);
    assert.equal(retrievedCertificate.status, this.statusEnums.manufactored.pos.toString());

  });

  it('should verify the certificate signature matches with issuer', async()=>{

    const { inspector, manfacturerA } = this.defaultEntities;
    const vaccineBatchId = 0;
    const message = `Inspector (${inspector.id}) has certified vaccine batch #${vaccineBatchId} for 
    manufacturer (${manfacturerA.id}).`;

    const certificate = await this.coldChainInstance.certificates.call(0);

    const doesCertMatch = await this.coldChainInstance.isMatchingSignature(
      this.web3.utils.keccak256(message),
      certificate.id,
      inspector.id,
      { from: this.owner }
    );

    assert.equal(doesCertMatch, true);

  })

});
