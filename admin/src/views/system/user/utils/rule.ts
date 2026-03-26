import { reactive } from "vue";
import type { FormRules } from "element-plus";
import { isPhone, isEmail } from "@pureadmin/utils";

const PASSWORD_REGEXP =
  /^[\S]{6,18}$/;

/** 自定义表单规则校验 */
export const formRules = reactive(<FormRules>{
  nickname: [{ required: true, message: "用户昵称为必填项", trigger: "blur" }],
  username: [{ required: true, message: "用户名称为必填项", trigger: "blur" }],
  password: [
    {
      validator: (_rule, value, callback) => {
        if (value === "") {
          callback(new Error("用户密码为必填项"));
        } else if (!PASSWORD_REGEXP.test(value)) {
          callback(new Error("密码长度应为6-18位"));
        } else {
          callback();
        }
      },
      trigger: "blur"
    }
  ],
  phone: [
    {
      validator: (_rule, value, callback) => {
        if (value === "") {
          callback();
        } else if (!isPhone(value)) {
          callback(new Error("请输入正确的手机号码格式"));
        } else {
          callback();
        }
      },
      trigger: "blur"
    }
  ],
  email: [
    {
      validator: (_rule, value, callback) => {
        if (value === "") {
          callback();
        } else if (!isEmail(value)) {
          callback(new Error("请输入正确的邮箱格式"));
        } else {
          callback();
        }
      },
      trigger: "blur"
    }
  ]
});
