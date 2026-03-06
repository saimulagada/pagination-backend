module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("Users", "password", {
      type: Sequelize.STRING,
      allowNull: false,
    });

    await queryInterface.addColumn("Users", "role", {
      type: Sequelize.STRING,
      defaultValue: "user",
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn("Users", "password");
    await queryInterface.removeColumn("Users", "role");
  },
};