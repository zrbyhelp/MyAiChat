export async function up({ context, Sequelize }) {
  const robotTable = await context.describeTable('robots')
  if (!robotTable.image_fetch_enabled) {
    await context.addColumn('robots', 'image_fetch_enabled', {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    })
  }
  if (!robotTable.image_fetch_prompt) {
    await context.addColumn('robots', 'image_fetch_prompt', {
      type: Sequelize.TEXT,
      allowNull: true,
    })
    await context.sequelize.query("UPDATE `robots` SET `image_fetch_prompt` = '' WHERE `image_fetch_prompt` IS NULL")
    await context.changeColumn('robots', 'image_fetch_prompt', {
      type: Sequelize.TEXT,
      allowNull: false,
    })
  }

  const sessionTable = await context.describeTable('sessions')
  if (!sessionTable.robot_image_fetch_enabled) {
    await context.addColumn('sessions', 'robot_image_fetch_enabled', {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    })
  }
  if (!sessionTable.robot_image_fetch_prompt) {
    await context.addColumn('sessions', 'robot_image_fetch_prompt', {
      type: Sequelize.TEXT,
      allowNull: true,
    })
    await context.sequelize.query("UPDATE `sessions` SET `robot_image_fetch_prompt` = '' WHERE `robot_image_fetch_prompt` IS NULL")
    await context.changeColumn('sessions', 'robot_image_fetch_prompt', {
      type: Sequelize.TEXT,
      allowNull: false,
    })
  }

  const sessionMessageTable = await context.describeTable('session_messages')
  if (!sessionMessageTable.images_json) {
    await context.addColumn('session_messages', 'images_json', {
      type: Sequelize.TEXT('long'),
      allowNull: true,
    })
    await context.sequelize.query("UPDATE `session_messages` SET `images_json` = '[]' WHERE `images_json` IS NULL")
    await context.changeColumn('session_messages', 'images_json', {
      type: Sequelize.TEXT('long'),
      allowNull: false,
    })
  }
}

export async function down({ context }) {
  const sessionMessageTable = await context.describeTable('session_messages')
  if (sessionMessageTable.images_json) {
    await context.removeColumn('session_messages', 'images_json')
  }

  const sessionTable = await context.describeTable('sessions')
  if (sessionTable.robot_image_fetch_prompt) {
    await context.removeColumn('sessions', 'robot_image_fetch_prompt')
  }
  if (sessionTable.robot_image_fetch_enabled) {
    await context.removeColumn('sessions', 'robot_image_fetch_enabled')
  }

  const robotTable = await context.describeTable('robots')
  if (robotTable.image_fetch_prompt) {
    await context.removeColumn('robots', 'image_fetch_prompt')
  }
  if (robotTable.image_fetch_enabled) {
    await context.removeColumn('robots', 'image_fetch_enabled')
  }
}
