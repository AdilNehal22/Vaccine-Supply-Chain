//const ConvertLib = artifacts.require("ConvertLib");
const ColdChain = artifacts.require("ColdChain");

module.exports = function(deployer) {
  deployer.deploy(ColdChain);
};
